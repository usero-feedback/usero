// Session replay plugin for the Usero widget.
//
// Streams rrweb events to the SaaS side as gzipped chunks while the user
// is on the page, instead of buffering in memory and attaching to a
// feedback submission. This decouples session replay from feedback so we
// capture every session (subject to bot-gate + sampling + engagement
// gates), not just the ones that submit feedback.
//
// Lifecycle:
//   1. onInit: dice-roll sample, optional engagement-time gate, mint a
//      stable per-tab `sdkSessionId` in sessionStorage, and POST to
//      /api/replay-sessions to create the row. If the server returns
//      `{accepted:false}` (bot-gated), the plugin no-ops the rest of the
//      session and getCurrentSession() returns null.
//   2. Recording: lazy-load rrweb, append events to a buffer, flush a
//      chunk every `chunkSeconds` (or sooner if the buffer is large).
//      Each chunk is gzipped via CompressionStream and PUT to
//      /api/replay-sessions/:id/chunks/:seq with raw bytes + the three
//      X-Usero-* headers (Client-Id, Event-Count, Duration-Ms). Retries
//      with exponential backoff. R2 head-check makes retries idempotent
//      server-side. A chunk PUT returning 409 stops the session.
//   3. onFeedbackSubmit: returns `{sessionReplayId, replayOffsetMs}` so
//      the feedback record can FK at the moment of submit. Does NOT
//      attach `replayEvents` (legacy field) — chunked uploads carry the
//      events out-of-band.
//   4. onDestroy / pagehide: best-effort flush remaining buffer, then
//      sendBeacon to /api/replay-sessions/:id/finalise with the
//      end-timestamp. Idempotent server-side.
//
// Bundle hygiene: rrweb stays lazy via dynamic `import('rrweb')` behind
// the engagement gate, so consumers who lose the dice roll or navigate
// away inside the gate window pay zero rrweb bytes.

import { getOrMintAnonymousId } from '../identity'
import type { UseroPlugin, PluginContext } from '../plugin'

export interface ReplaySampling {
	mousemove?: number
	scroll?: number
	media?: number
	input?: number | 'last'
}

export interface SessionReplayOptions {
	// Wait this many ms after page load before loading rrweb and creating
	// the session row. If the user navigates away first, rrweb is never
	// loaded and no session row is created. Default 0 (start immediately).
	startAfterMs?: number
	// Probability (0..1) that this session records at all. Decided once
	// at init via Math.random(). Default 1.
	sampleRate?: number
	// rrweb sampling rates per event type.
	sampling?: ReplaySampling
	// Mask all <input>/<textarea> values in the recording. Default true.
	maskAllInputs?: boolean
	// CSS selector for nodes whose text content should be masked. Default
	// `[data-usero-mask]`.
	maskTextSelector?: string
	// Inline external stylesheets so the replay viewer renders correctly
	// without network access. Default true.
	inlineStylesheet?: boolean
	// Block (entirely skip) DOM subtrees matching this selector. Default
	// `[data-usero-block]`.
	blockSelector?: string
	// Flush a chunk every N seconds. Default 10. Smaller = more PUTs but
	// less data lost on tab crash.
	chunkSeconds?: number
	// Soft cap on buffered events before forcing a flush, regardless of
	// time. Default 5000.
	chunkMaxEvents?: number
	// Max attempts per chunk before giving up. Default 5.
	chunkMaxAttempts?: number
	// API origin. Override for self-hosted or local dev. Defaults to the
	// PluginContext baseUrl threaded through by the widget.
	apiUrl?: string
}

interface RrwebEvent {
	type: number
	data: unknown
	timestamp: number
}

interface RrwebRecordOptions {
	emit: (event: RrwebEvent) => void
	maskAllInputs?: boolean
	maskTextSelector?: string
	inlineStylesheet?: boolean
	blockSelector?: string
	sampling?: ReplaySampling
}

interface RrwebRecordFn {
	(opts: RrwebRecordOptions): () => void
	takeFullSnapshot?: (isCheckout?: boolean) => void
}

type RrwebRecord = RrwebRecordFn

interface ResolvedOptions {
	startAfterMs: number
	sampleRate: number
	sampling: ReplaySampling
	maskAllInputs: boolean
	maskTextSelector: string
	inlineStylesheet: boolean
	blockSelector: string
	chunkSeconds: number
	chunkMaxEvents: number
	chunkMaxAttempts: number
	apiUrl: string
}

interface ReplayStore {
	options: ResolvedOptions
	clientId: string
	sdkSessionId: string
	sessionReplayId: string | null
	// Wall-clock timestamp (ms) of the first event we ever recorded.
	// Used to compute replayOffsetMs at feedback-submit time.
	recordingStartedAt: number | null
	pendingEvents: RrwebEvent[]
	pendingFirstTs: number | null
	pendingLastTs: number | null
	nextChunkSeq: number
	uploadQueue: Promise<void>
	pendingUploads: number
	chunkFlushTimer: ReturnType<typeof setInterval> | null
	startTimer: ReturnType<typeof setTimeout> | null
	pageHideHandler: (() => void) | null
	shadowUpdateHandler: ((event: Event) => void) | null
	record: RrwebRecord | null
	stopRecording: (() => void) | null
	loadInProgress: boolean
	cancelled: boolean
	// True once the session is "done": bot-gated, finalised, or destroyed.
	stopped: boolean
}

const DEFAULTS: ResolvedOptions = {
	startAfterMs: 0,
	sampleRate: 1,
	sampling: { mousemove: 50, scroll: 100 },
	maskAllInputs: true,
	maskTextSelector: '[data-usero-mask]',
	inlineStylesheet: true,
	blockSelector: '[data-usero-block]',
	chunkSeconds: 10,
	chunkMaxEvents: 5000,
	chunkMaxAttempts: 5,
	apiUrl: '',
}

const SDK_SESSION_STORAGE_KEY = 'usero:session-replay:sdk-session-id'
const HARD_CHUNK_BYTE_CAP = 4 * 1024 * 1024

function uint8ToBase64(bytes: Uint8Array): string {
	let binary = ''
	const chunkSize = 0x8000
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const slice = bytes.subarray(i, i + chunkSize)
		binary += String.fromCharCode.apply(null, Array.from(slice))
	}
	return typeof btoa === 'function' ? btoa(binary) : ''
}

async function gzipBytes(input: string): Promise<Uint8Array> {
	if (typeof CompressionStream === 'undefined') {
		// Old browsers: send uncompressed JSON. Acceptable degradation;
		// the server endpoint accepts raw application/octet-stream.
		return new TextEncoder().encode(input)
	}
	const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'))
	const buf = await new Response(stream).arrayBuffer()
	return new Uint8Array(buf)
}

function generateRandomId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID()
	}
	const bytes = new Uint8Array(16)
	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		crypto.getRandomValues(bytes)
	} else {
		for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
	}
	let out = ''
	for (const b of bytes) out += b.toString(16).padStart(2, '0')
	return out
}

function mintSdkSessionId(): string {
	try {
		const existing = window.sessionStorage?.getItem(SDK_SESSION_STORAGE_KEY)
		if (existing && /^[a-z0-9-]{8,}$/i.test(existing)) return existing
	} catch {
		// sessionStorage can throw in sandboxed iframes — fall through.
	}
	const id = generateRandomId()
	try {
		window.sessionStorage?.setItem(SDK_SESSION_STORAGE_KEY, id)
	} catch {
		// Ignore: we still return the freshly minted id.
	}
	return id
}

function joinUrl(apiUrl: string, path: string): string {
	return `${apiUrl.replace(/\/$/, '')}${path}`
}

interface CreateSessionResult {
	accepted: boolean
	sessionReplayId?: string
	dropReason?: string
}

async function createSession(
	apiUrl: string,
	clientId: string,
	sdkSessionId: string,
	anonymousId: string,
): Promise<CreateSessionResult | null> {
	try {
		const startUrl =
			typeof window !== 'undefined' && window.location ? window.location.href : undefined
		const userAgent =
			typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : undefined
		const res = await fetch(joinUrl(apiUrl, '/api/replay-sessions'), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				clientId,
				sdkSessionId,
				anonymousId,
				startUrl,
				userAgent,
				startedAt: new Date().toISOString(),
			}),
		})
		if (!res.ok) return null
		const json = (await res.json()) as {
			accepted?: unknown
			sessionReplayId?: unknown
			dropReason?: unknown
		}
		if (typeof json.accepted !== 'boolean') return null
		const result: CreateSessionResult = { accepted: json.accepted }
		if (typeof json.sessionReplayId === 'string') result.sessionReplayId = json.sessionReplayId
		if (typeof json.dropReason === 'string') result.dropReason = json.dropReason
		return result
	} catch {
		return null
	}
}

interface ChunkUploadResult {
	ok: boolean
	stopSession: boolean
}

async function uploadChunk(
	apiUrl: string,
	sessionReplayId: string,
	clientId: string,
	seq: number,
	bytes: Uint8Array,
	eventCount: number,
	durationMs: number,
	logger: PluginContext['logger'],
	maxAttempts: number,
): Promise<ChunkUploadResult> {
	const url = joinUrl(
		apiUrl,
		`/api/replay-sessions/${encodeURIComponent(sessionReplayId)}/chunks/${seq}`,
	)
	let attempt = 0
	while (attempt < maxAttempts) {
		try {
			// Wrap in a Blob so the body type is unambiguously BodyInit; some
			// TS lib targets reject raw Uint8Array as fetch body. Slice off
			// the buffer to satisfy the BlobPart ArrayBuffer constraint
			// (Uint8Array<SharedArrayBuffer> is the alternative the lib
			// admits, which we never produce here).
			const buffer = bytes.buffer.slice(
				bytes.byteOffset,
				bytes.byteOffset + bytes.byteLength,
			) as ArrayBuffer
			const blob = new Blob([buffer], { type: 'application/octet-stream' })
			const res = await fetch(url, {
				method: 'PUT',
				body: blob,
				headers: {
					'Content-Type': 'application/octet-stream',
					'X-Usero-Client-Id': clientId,
					'X-Usero-Event-Count': String(eventCount),
					'X-Usero-Duration-Ms': String(Math.max(0, Math.round(durationMs))),
				},
			})
			if (res.ok) return { ok: true, stopSession: false }
			// 409: server told us to stop (bot-dropped, or session already
			// finalised). Don't retry, don't upload further chunks.
			if (res.status === 409) {
				logger.warn(`chunk ${seq} rejected with 409, stopping session`)
				return { ok: false, stopSession: true }
			}
			// Other 4xx (besides 408/429) won't get better with retry.
			if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
				logger.error(`chunk ${seq} rejected with ${res.status}`)
				return { ok: false, stopSession: false }
			}
		} catch (err) {
			logger.warn(`chunk ${seq} attempt ${attempt + 1} failed`, err)
		}
		attempt += 1
		const backoff = Math.min(15_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250)
		await new Promise(resolve => setTimeout(resolve, backoff))
	}
	logger.error(`chunk ${seq} dropped after ${maxAttempts} attempts`)
	return { ok: false, stopSession: false }
}

async function loadRrwebRecord(): Promise<RrwebRecord | null> {
	try {
		const mod: unknown = await import(/* webpackChunkName: "rrweb" */ 'rrweb')
		if (
			mod &&
			typeof mod === 'object' &&
			'record' in mod &&
			typeof (mod as { record: unknown }).record === 'function'
		) {
			return (mod as { record: RrwebRecord }).record
		}
		return null
	} catch {
		return null
	}
}

function scheduleChunkUpload(store: ReplayStore, ctx: PluginContext): void {
	if (!store.sessionReplayId) return
	if (store.pendingEvents.length === 0) return
	// Chunk boundary: re-resolve the user. Captures mid-session login on
	// replay-only installs that never open the widget. No-op via fingerprint
	// dedupe if nothing changed.
	try {
		ctx.resolveUser?.()
	} catch (err) {
		ctx.logger.warn('resolveUser threw at chunk boundary', err)
	}
	const events = store.pendingEvents
	const eventCount = events.length
	const firstTs = store.pendingFirstTs ?? 0
	const lastTs = store.pendingLastTs ?? firstTs
	const durationMs = Math.max(0, lastTs - firstTs)
	const seq = store.nextChunkSeq
	store.nextChunkSeq += 1
	store.pendingEvents = []
	store.pendingFirstTs = null
	store.pendingLastTs = null

	const sessionReplayId = store.sessionReplayId
	const apiUrl = store.options.apiUrl
	const clientId = store.clientId
	const maxAttempts = store.options.chunkMaxAttempts

	store.pendingUploads += 1
	store.uploadQueue = store.uploadQueue.then(async () => {
		try {
			if (store.cancelled) return
			const json = JSON.stringify(events)
			const bytes = await gzipBytes(json)
			if (bytes.byteLength > HARD_CHUNK_BYTE_CAP) {
				ctx.logger.error(
					`chunk ${seq} exceeds 4MB hard cap (${bytes.byteLength} bytes), dropping`,
				)
				return
			}
			const result = await uploadChunk(
				apiUrl,
				sessionReplayId,
				clientId,
				seq,
				bytes,
				eventCount,
				durationMs,
				ctx.logger,
				maxAttempts,
			)
			if (result.stopSession) {
				store.stopped = true
				stopRrweb(store)
			}
		} catch (err) {
			ctx.logger.error(`chunk ${seq} encode failed`, err)
		} finally {
			store.pendingUploads -= 1
		}
	})
}

function flushPendingChunk(store: ReplayStore, ctx: PluginContext): void {
	if (store.stopped || store.cancelled) return
	if (store.pendingEvents.length === 0) return
	scheduleChunkUpload(store, ctx)
}

function stopRrweb(store: ReplayStore): void {
	if (store.stopRecording) {
		try {
			store.stopRecording()
		} catch {
			// Already stopped.
		}
		store.stopRecording = null
	}
	if (store.chunkFlushTimer) {
		clearInterval(store.chunkFlushTimer)
		store.chunkFlushTimer = null
	}
}

function startRecording(store: ReplayStore, ctx: PluginContext): void {
	if (store.cancelled || store.stopped || store.stopRecording || store.loadInProgress) return
	store.loadInProgress = true
	void loadRrwebRecord().then(record => {
		store.loadInProgress = false
		if (store.cancelled || store.stopped || !record) {
			if (!record) ctx.logger.warn('rrweb failed to load, replay disabled')
			return
		}
		try {
			const stop = record({
				emit: event => {
					if (store.stopped || store.cancelled) return
					if (store.recordingStartedAt === null) store.recordingStartedAt = event.timestamp
					store.pendingEvents.push(event)
					if (store.pendingFirstTs === null) store.pendingFirstTs = event.timestamp
					store.pendingLastTs = event.timestamp
					if (store.pendingEvents.length >= store.options.chunkMaxEvents) {
						scheduleChunkUpload(store, ctx)
					}
				},
				maskAllInputs: store.options.maskAllInputs,
				maskTextSelector: store.options.maskTextSelector || undefined,
				inlineStylesheet: store.options.inlineStylesheet,
				blockSelector: store.options.blockSelector,
				sampling: store.options.sampling,
			})
			store.stopRecording = stop
			store.record = record
			scheduleShadowSnapshot(store, ctx)

			store.chunkFlushTimer = setInterval(
				() => flushPendingChunk(store, ctx),
				store.options.chunkSeconds * 1000,
			)
		} catch (err) {
			ctx.logger.error('rrweb record() threw', err)
		}
	})
}

function scheduleShadowSnapshot(store: ReplayStore, ctx: PluginContext): void {
	if (store.cancelled || store.stopped || !store.record || !store.stopRecording) return
	const fn = store.record.takeFullSnapshot
	if (typeof fn !== 'function') return
	try {
		fn(true)
	} catch (err) {
		ctx.logger.warn('takeFullSnapshot threw', err)
	}
}

function finalise(store: ReplayStore, ctx: PluginContext, opts: { useBeacon: boolean }): void {
	if (!store.sessionReplayId) return
	if (store.pendingEvents.length > 0) flushPendingChunk(store, ctx)
	const url = joinUrl(
		store.options.apiUrl,
		`/api/replay-sessions/${encodeURIComponent(store.sessionReplayId)}/finalise`,
	)
	const body = JSON.stringify({ clientId: store.clientId, endedAt: new Date().toISOString() })
	if (opts.useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
		try {
			const blob = new Blob([body], { type: 'application/json' })
			navigator.sendBeacon(url, blob)
			return
		} catch (err) {
			ctx.logger.warn('finalise sendBeacon threw', err)
		}
	}
	void fetch(url, {
		method: 'POST',
		body,
		headers: { 'Content-Type': 'application/json' },
		keepalive: true,
	}).catch(err => ctx.logger.warn('finalise fetch failed', err))
}

export interface CurrentSessionHandle {
	id: string
	offsetMs: number
}

export function sessionReplay(options: SessionReplayOptions = {}): UseroPlugin {
	const merged: ResolvedOptions = {
		...DEFAULTS,
		...options,
		sampling: { ...DEFAULTS.sampling, ...(options.sampling ?? {}) },
	}

	return {
		name: 'session-replay',
		onInit(ctx) {
			if (typeof window === 'undefined') return
			if (merged.sampleRate < 1 && Math.random() >= merged.sampleRate) {
				ctx.logger.debug('skipped by sampleRate')
				return
			}

			const apiUrl = merged.apiUrl || ctx.baseUrl
			if (!apiUrl) {
				ctx.logger.error('session-replay needs an apiUrl (via options or PluginContext)')
				return
			}
			const sdkSessionId = mintSdkSessionId()
			// Mint or read the cross-session anonymousId. Cached in module
			// scope after the first call, so this stays O(1) on hot paths.
			const anonymousId = getOrMintAnonymousId()

			const store: ReplayStore = {
				options: { ...merged, apiUrl },
				clientId: ctx.clientId,
				sdkSessionId,
				sessionReplayId: null,
				recordingStartedAt: null,
				pendingEvents: [],
				pendingFirstTs: null,
				pendingLastTs: null,
				nextChunkSeq: 0,
				uploadQueue: Promise.resolve(),
				pendingUploads: 0,
				chunkFlushTimer: null,
				startTimer: null,
				pageHideHandler: null,
				shadowUpdateHandler: null,
				record: null,
				stopRecording: null,
				loadInProgress: false,
				cancelled: false,
				stopped: false,
			}
			ctx.setStore(store)

			const onShadowUpdate = (): void => scheduleShadowSnapshot(store, ctx)
			store.shadowUpdateHandler = onShadowUpdate
			window.addEventListener('usero:shadow-update', onShadowUpdate)

			const onPageHide = (): void => {
				finalise(store, ctx, { useBeacon: true })
				store.stopped = true
				stopRrweb(store)
			}
			store.pageHideHandler = onPageHide
			window.addEventListener('pagehide', onPageHide)

			const begin = async (): Promise<void> => {
				if (store.cancelled) return
				// Replay-only customers may never open the widget, so the host's
				// user state never gets polled by the widget's interaction
				// boundaries. Re-resolve here so a mid-session login that
				// happened before session start is visible server-side before
				// the first chunk lands. Fingerprint dedupe inside
				// identifyIfChanged makes this effectively free when nothing
				// changed.
				try {
					ctx.resolveUser?.()
				} catch (err) {
					ctx.logger.warn('resolveUser threw at session start', err)
				}
				const created = await createSession(apiUrl, ctx.clientId, sdkSessionId, anonymousId)
				if (!created) {
					ctx.logger.warn('session create failed, replay disabled')
					store.stopped = true
					return
				}
				if (!created.accepted) {
					ctx.logger.info(`session-replay declined: ${created.dropReason ?? 'unknown'}`)
					store.stopped = true
					return
				}
				if (!created.sessionReplayId) {
					ctx.logger.error('server accepted but returned no sessionReplayId')
					store.stopped = true
					return
				}
				store.sessionReplayId = created.sessionReplayId
				store.recordingStartedAt = Date.now()
				startRecording(store, ctx)
			}

			if (merged.startAfterMs > 0) {
				const cancelOnExit = (): void => {
					store.cancelled = true
					if (store.startTimer) {
						clearTimeout(store.startTimer)
						store.startTimer = null
					}
				}
				window.addEventListener('pagehide', cancelOnExit, { once: true })
				window.addEventListener('beforeunload', cancelOnExit, { once: true })
				store.startTimer = setTimeout(() => {
					void begin()
				}, merged.startAfterMs)
			} else {
				void begin()
			}
		},
		onFeedbackSubmit(ctx) {
			const store = ctx.getStore<ReplayStore>()
			if (!store || store.cancelled || store.stopped) return undefined
			if (!store.sessionReplayId) return undefined
			const offsetMs =
				store.recordingStartedAt !== null
					? Math.max(0, Date.now() - store.recordingStartedAt)
					: 0
			return { sessionReplayId: store.sessionReplayId, replayOffsetMs: offsetMs }
		},
		onDestroy(ctx) {
			const store = ctx.getStore<ReplayStore>()
			if (!store) return
			store.cancelled = true
			if (store.startTimer) {
				clearTimeout(store.startTimer)
				store.startTimer = null
			}
			if (store.pageHideHandler) {
				window.removeEventListener('pagehide', store.pageHideHandler)
				store.pageHideHandler = null
			}
			if (store.shadowUpdateHandler) {
				window.removeEventListener('usero:shadow-update', store.shadowUpdateHandler)
				store.shadowUpdateHandler = null
			}
			// SPA route change / React unmount: send a finalise so the
			// server stamps endedAt. fetch+keepalive is fine here since we
			// aren't necessarily in a pagehide path.
			if (store.sessionReplayId && !store.stopped) {
				finalise(store, ctx, { useBeacon: false })
			}
			store.stopped = true
			stopRrweb(store)
			store.pendingEvents.length = 0
		},
	}
}

// Returns the live session-replay handle for a given plugin context, or
// null if the session was bot-dropped, sample-skipped, or not yet
// created. Other plugins (e.g. user-test) can call this to attach the
// replay FK + offset to their own server-side records.
export function getCurrentSession(ctx: PluginContext): CurrentSessionHandle | null {
	const store = ctx.getStore<ReplayStore>()
	if (!store || store.cancelled || store.stopped || !store.sessionReplayId) return null
	const offsetMs =
		store.recordingStartedAt !== null
			? Math.max(0, Date.now() - store.recordingStartedAt)
			: 0
	return { id: store.sessionReplayId, offsetMs }
}

// Internal helper exports for testing only. Not part of the public API.
export const __test__ = {
	uint8ToBase64,
	gzipBytes,
	mintSdkSessionId,
	uploadChunk,
	createSession,
	joinUrl,
	HARD_CHUNK_BYTE_CAP,
	SDK_SESSION_STORAGE_KEY,
}
