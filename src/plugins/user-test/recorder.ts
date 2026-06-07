// Recording engine for the user-test plugin: getUserMedia / MediaRecorder
// lifecycle, the chunk upload queue with retry + IndexedDB offline stash, the
// silent-microphone guard, and mute/stop handling. It writes the resume pointer
// (via session.persistActiveSession) as the chunk index advances, and pokes the
// indicator (via ui.renderIndicatorState) on mic state transitions.

import type { PluginContext } from '../../plugin'
import { persistActiveSession } from './session'
import {
	IDB_NAME,
	IDB_STORE,
	type PendingChunk,
	type RecorderStore,
	SILENCE_FLOOR_DB,
	SILENCE_POLL_MS,
	SILENCE_RMS_DB_THRESHOLD,
	SILENCE_SUSTAINED_MS,
	type SilenceMonitor,
} from './shared'
import { renderIndicatorState } from './ui'

export function isMediaRecorderSupported(): boolean {
	return typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

export function pickMimeType(): string | undefined {
	const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
	for (const candidate of candidates) {
		if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(candidate)) {
			return candidate
		}
	}
	return undefined
}

// IndexedDB helpers. Best-effort, never throw upstream — if IDB is missing
// or quota-blown we just lose offline resilience but the live upload path
// still runs.
function idbOpen(): Promise<IDBDatabase | null> {
	return new Promise(resolve => {
		if (typeof indexedDB === 'undefined') {
			resolve(null)
			return
		}
		try {
			const req = indexedDB.open(IDB_NAME, 1)
			req.onupgradeneeded = (): void => {
				const db = req.result
				if (!db.objectStoreNames.contains(IDB_STORE)) {
					db.createObjectStore(IDB_STORE, { keyPath: 'id' })
				}
			}
			req.onsuccess = (): void => resolve(req.result)
			req.onerror = (): void => resolve(null)
		} catch {
			resolve(null)
		}
	})
}

async function idbStashChunk(chunk: PendingChunk): Promise<void> {
	const db = await idbOpen()
	if (!db) return
	await new Promise<void>(resolve => {
		try {
			const tx = db.transaction(IDB_STORE, 'readwrite')
			tx.objectStore(IDB_STORE).put(chunk)
			tx.oncomplete = (): void => resolve()
			tx.onerror = (): void => resolve()
			tx.onabort = (): void => resolve()
		} catch {
			resolve()
		}
	})
	db.close()
}

async function idbDeleteChunk(id: string): Promise<void> {
	const db = await idbOpen()
	if (!db) return
	await new Promise<void>(resolve => {
		try {
			const tx = db.transaction(IDB_STORE, 'readwrite')
			tx.objectStore(IDB_STORE).delete(id)
			tx.oncomplete = (): void => resolve()
			tx.onerror = (): void => resolve()
			tx.onabort = (): void => resolve()
		} catch {
			resolve()
		}
	})
	db.close()
}

async function idbListChunks(sessionId: string): Promise<PendingChunk[]> {
	const db = await idbOpen()
	if (!db) return []
	const items = await new Promise<PendingChunk[]>(resolve => {
		try {
			const tx = db.transaction(IDB_STORE, 'readonly')
			const req = tx.objectStore(IDB_STORE).getAll()
			req.onsuccess = (): void => {
				const all = (req.result as PendingChunk[]) ?? []
				resolve(all.filter(c => c.sessionId === sessionId))
			}
			req.onerror = (): void => resolve([])
		} catch {
			resolve([])
		}
	})
	db.close()
	return items
}

async function uploadChunkWithRetry(
	apiUrl: string,
	sessionId: string,
	index: number,
	blob: Blob,
	logger: PluginContext['logger'],
	maxAttempts = 5,
): Promise<boolean> {
	const url = `${apiUrl.replace(/\/$/, '')}/api/user-test-sessions/${encodeURIComponent(sessionId)}/chunk?index=${index}`
	let attempt = 0
	while (attempt < maxAttempts) {
		try {
			const res = await fetch(url, {
				method: 'PUT',
				body: blob,
				headers: { 'Content-Type': blob.type || 'audio/webm' },
				keepalive: blob.size <= 60 * 1024, // browsers cap keepalive bodies
			})
			if (res.ok) return true
			// 4xx (other than 413) won't get better with retries; bail early.
			if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
				logger.error(`chunk ${index} rejected with ${res.status}`)
				return false
			}
		} catch (err) {
			logger.warn(`chunk ${index} upload attempt ${attempt + 1} failed`, err)
		}
		attempt += 1
		const backoff = Math.min(15000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250)
		await new Promise(resolve => setTimeout(resolve, backoff))
	}
	return false
}

export async function flushPendingFromIdb(store: RecorderStore, ctx: PluginContext): Promise<void> {
	if (!store.sessionId) return
	const pending = await idbListChunks(store.sessionId)
	for (const chunk of pending) {
		const ok = await uploadChunkWithRetry(chunk.apiUrl, chunk.sessionId, chunk.chunkIndex, chunk.blob, ctx.logger, 3)
		if (ok) await idbDeleteChunk(chunk.id)
	}
}

function enqueueChunk(store: RecorderStore, ctx: PluginContext, blob: Blob): void {
	if (store.cancelled || !store.sessionId || blob.size === 0) return
	const index = store.chunkIndex
	store.chunkIndex += 1
	// Advance the persisted resume pointer so a hard navigation mid-recording
	// resumes from the next index, never re-using one already shipped. If the
	// page is pausing (store.paused, set before stopRecording) or finishing, the
	// trailing chunk stopRecording flushes must persist as 'paused' so pausedAt is
	// preserved and the RESUME_MAX_IDLE_MS idle gate engages; an 'active' write
	// here would clobber pausedAt.
	persistActiveSession(store, store.paused || store.finishFlowRan ? 'paused' : 'active')
	store.pendingUploads += 1
	const sessionId = store.sessionId
	const apiUrl = store.options.apiUrl

	store.uploadQueue = store.uploadQueue.then(async () => {
		const ok = await uploadChunkWithRetry(apiUrl, sessionId, index, blob, ctx.logger)
		if (!ok) {
			ctx.logger.warn(`chunk ${index} stashed for offline retry`)
			await idbStashChunk({
				id: `${sessionId}:${index}:${Date.now()}`,
				sessionId,
				apiUrl,
				chunkIndex: index,
				blob,
				createdAt: Date.now(),
			})
		}
		store.pendingUploads -= 1
	})
}

// ---------------------------------------------------------------------------
// Silent-microphone guard
//
// A dead mic, or a virtual audio input device that macOS hands Chrome (e.g.
// "Background Music", a Zoom/Teams virtual mic), delivers digital silence.
// getUserMedia succeeds, MediaRecorder records, and 15 minutes of nothing
// reaches the researcher with no warning. We DETECT a silent input stream and
// WARN the participant (non-blocking: recording always continues).
//
// Detection runs a Web Audio AnalyserNode over the live track and computes RMS
// in dBFS over a short window. The decision is a pure function so it can be
// unit-tested without a real AudioContext.

// Compute RMS in dBFS from normalized float time-domain samples (each in
// [-1, 1], as produced by AnalyserNode.getFloatTimeDomainData). Returns a
// finite dB value floored at SILENCE_FLOOR_DB so an all-zero window doesn't
// yield -Infinity. Pure, no Web Audio needed: unit-tested directly.
export function rmsDbFromSamples(samples: Float32Array | number[]): number {
	const n = samples.length
	if (n === 0) return SILENCE_FLOOR_DB
	let sumSquares = 0
	for (let i = 0; i < n; i += 1) {
		const s = samples[i] ?? 0
		sumSquares += s * s
	}
	const rms = Math.sqrt(sumSquares / n)
	if (rms <= 0) return SILENCE_FLOOR_DB
	const db = 20 * Math.log10(rms)
	return db < SILENCE_FLOOR_DB ? SILENCE_FLOOR_DB : db
}

// Pure silence decision. Accepts EITHER an already-computed RMS dB value (a
// number) OR a sample window (array). True only when the level is at/below the
// conservative silence threshold. A real voice, even a quiet one (-40 to
// -50 dB), is comfortably above the line and returns false.
export function isStreamSilent(input: number | Float32Array | number[]): boolean {
	const rmsDb = typeof input === 'number' ? input : rmsDbFromSamples(input)
	return rmsDb <= SILENCE_RMS_DB_THRESHOLD
}

function startSilenceMonitor(stream: MediaStream, onChange: (silent: boolean) => void, logger: PluginContext['logger']): SilenceMonitor | null {
	const Ctor: typeof AudioContext | undefined =
		typeof window !== 'undefined'
			? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
			: undefined
	if (!Ctor) return null

	let audioCtx: AudioContext
	let source: MediaStreamAudioSourceNode
	let analyser: AnalyserNode
	try {
		audioCtx = new Ctor()
		source = audioCtx.createMediaStreamSource(stream)
		analyser = audioCtx.createAnalyser()
		analyser.fftSize = 2048
		// We do not connect the analyser to audioCtx.destination: we only READ
		// the track, never play it back (that would echo the participant's own
		// mic into their speakers).
		source.connect(analyser)
	} catch (err) {
		logger.warn('silence monitor: failed to attach analyser', err)
		return null
	}

	const buffer = new Float32Array(analyser.fftSize)
	// Reported state (what the pill currently shows). Starts audible; we only
	// flip to silent after SILENCE_SUSTAINED_MS of continuous silence.
	let reportedSilent = false
	// Timestamp the CURRENT run of same-classification readings began.
	let runStartedAt = Date.now()
	let lastRaw = false
	let intervalId: ReturnType<typeof setInterval> | null = null

	const tick = (): void => {
		// getFloatTimeDomainData is widely supported; guard for older engines.
		try {
			analyser.getFloatTimeDomainData(buffer)
		} catch {
			return
		}
		const rawSilent = isStreamSilent(buffer)
		const now = Date.now()
		if (rawSilent !== lastRaw) {
			lastRaw = rawSilent
			runStartedAt = now
		}
		// Only commit a state change once the raw classification has held for
		// the sustained window. Going audible clears the warning immediately
		// once sustained, going silent raises it once sustained.
		if (rawSilent !== reportedSilent && now - runStartedAt >= SILENCE_SUSTAINED_MS) {
			reportedSilent = rawSilent
			onChange(reportedSilent)
		}
	}

	intervalId = setInterval(tick, SILENCE_POLL_MS)

	return {
		stop(): void {
			if (intervalId !== null) {
				clearInterval(intervalId)
				intervalId = null
			}
			try {
				source.disconnect()
				analyser.disconnect()
			} catch {
				// nodes may already be torn down
			}
			// close() returns a promise; failures here are harmless (context may
			// already be closing on page unload).
			try {
				void audioCtx.close()
			} catch {
				// ignore
			}
		},
	}
}

export async function startRecording(store: RecorderStore, ctx: PluginContext): Promise<void> {
	// Re-entrant: the failed chip re-invokes this to retry. Reset to the
	// pending state so the chip shows "connecting" again during the attempt.
	store.micAcquiring = true
	store.micFailReason = null
	// A retry tears down a prior monitor and clears the silent flag so the
	// fresh attempt starts from a clean state.
	if (store.silenceMonitor) {
		store.silenceMonitor.stop()
		store.silenceMonitor = null
	}
	store.micSilent = false
	renderIndicatorState(store)
	if (!isMediaRecorderSupported()) {
		ctx.logger.warn('MediaRecorder not supported, continuing without audio')
		store.micAcquiring = false
		store.micFailReason = 'unsupported'
		store.indicatorState = 'no-audio'
		renderIndicatorState(store)
		return
	}
	let stream: MediaStream
	try {
		stream = await navigator.mediaDevices.getUserMedia({ audio: true })
	} catch (err) {
		ctx.logger.warn('mic permission denied or unavailable', err)
		store.micAcquiring = false
		// Distinguish denied (blocked) from no-device (not-found) for copy.
		const name = err instanceof Error ? err.name : ''
		store.micFailReason = name === 'NotFoundError' || name === 'DevicesNotFoundError' ? 'not-found' : 'blocked'
		store.indicatorState = 'no-audio'
		renderIndicatorState(store)
		return
	}
	store.stream = stream
	store.hasMicPermission = true
	store.micAcquiring = false
	store.micFailReason = null
	const mimeType = pickMimeType()
	let recorder: MediaRecorder
	try {
		recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
	} catch (err) {
		ctx.logger.error('MediaRecorder construction failed', err)
		stream.getTracks().forEach(t => t.stop())
		store.stream = null
		store.hasMicPermission = false
		store.micAcquiring = false
		store.micFailReason = 'unsupported'
		store.indicatorState = 'no-audio'
		renderIndicatorState(store)
		return
	}
	store.recorder = recorder
	recorder.addEventListener('dataavailable', event => {
		if (event.data && event.data.size > 0) {
			enqueueChunk(store, ctx, event.data)
		}
	})
	recorder.addEventListener('error', event => {
		ctx.logger.error('MediaRecorder error', event)
	})
	// `timeslice` makes the recorder emit a self-contained chunk every N ms.
	recorder.start(store.options.chunkSeconds * 1000)
	// On a successful (re)acquire, restore the live recording indicator. A
	// prior failed attempt left indicatorState at 'no-audio' (steady amber
	// dot); now that audio is live the dot should pulse red again.
	if (store.indicatorState === 'no-audio') {
		store.indicatorState = 'recording'
	}
	renderIndicatorState(store)

	// Start the silent-mic guard over the live track. Detects a dead or virtual
	// silent input at record start and keeps checking for a mid-session mic
	// death. Warning only; recording is never gated on it. When the participant
	// has muted themselves the track is intentionally silent, so we suppress the
	// warning in that case (see the onChange guard).
	const monitor = startSilenceMonitor(
		stream,
		silent => {
			// Ignore the analyser while the participant has deliberately muted:
			// a muted track reads as silence by design, that's not a fault.
			const effectiveSilent = silent && !store.muted
			if (store.micSilent === effectiveSilent) return
			store.micSilent = effectiveSilent
			renderIndicatorState(store)
		},
		ctx.logger,
	)
	store.silenceMonitor = monitor
}

export function toggleMute(store: RecorderStore): boolean {
	if (!store.stream || !store.hasMicPermission) return false
	const tracks = store.stream.getAudioTracks()
	if (tracks.length === 0) return false
	const nowMs = Date.now() - store.startedAt
	if (!store.muted) {
		// Going muted: disable each audio track. MediaRecorder keeps running;
		// the disabled track produces silence in the resulting WebM. We do NOT
		// pause the recorder so the single-stream lifecycle stays simple.
		for (const t of tracks) t.enabled = false
		store.muted = true
		store.mutedSinceMs = nowMs
	} else {
		// Coming back: close the muted segment, re-enable.
		const startMs = store.mutedSinceMs ?? nowMs
		if (nowMs > startMs) {
			store.mutedSegments.push({ startMs, endMs: nowMs })
		}
		store.mutedSinceMs = null
		store.muted = false
		for (const t of tracks) t.enabled = true
	}
	return true
}

export function flushMuteIfActive(store: RecorderStore): void {
	if (!store.muted || store.mutedSinceMs === null) return
	const nowMs = Date.now() - store.startedAt
	if (nowMs > store.mutedSinceMs) {
		store.mutedSegments.push({ startMs: store.mutedSinceMs, endMs: nowMs })
	}
	store.mutedSinceMs = null
}

export function stopRecording(store: RecorderStore): void {
	if (store.silenceMonitor) {
		store.silenceMonitor.stop()
		store.silenceMonitor = null
	}
	store.micSilent = false
	const recorder = store.recorder
	if (recorder && recorder.state !== 'inactive') {
		try {
			recorder.requestData()
		} catch {
			// requestData throws if state is invalid; ignore.
		}
		try {
			recorder.stop()
		} catch {
			// already stopped
		}
	}
	store.recorder = null
	if (store.stream) {
		store.stream.getTracks().forEach(t => t.stop())
		store.stream = null
	}
}
