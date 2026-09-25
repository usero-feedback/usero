// Session replay for the Usero SDK. Canonical entry: `@usero/sdk/replay`
// (the legacy `@usero/sdk/plugins/session-replay` subpath re-exports this
// module unchanged).
//
// Dual-mode: the same `sessionReplay()` factory returns an object that is
// BOTH a `UseroPlugin` (pass it in the widget's `plugins` array, exactly as
// before) AND a standalone recorder (`.start()` / `.stop()`), so replay-only
// consumers can record sessions without ever mounting the feedback widget:
//
//   sessionReplay({ clientId: 'YOUR_CLIENT_ID' }).start()
//
// Standalone mode builds a minimal PluginContext (clientId + baseUrl +
// core-owned identity accessors) with no widget instance and no DOM
// footprint. At most ONE recording runs per page, coordinated through a
// globalThis slot so even duplicated bundle copies of this module agree:
// if a widget later mounts with a replay plugin while a standalone
// recording is live, the widget links its feedback to the running session
// instead of starting a second recorder.
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
//   4. onDestroy / pagehide / visibilitychange -> hidden: best-effort flush
//      remaining buffer, then sendBeacon to
//      /api/replay-sessions/:id/finalise with the end-timestamp. Idempotent
//      server-side and via a `stopped` guard client-side.
//
// Bundle hygiene: rrweb stays lazy via dynamic `import('rrweb')` behind
// the engagement gate, so consumers who lose the dice roll or navigate
// away inside the gate window pay zero rrweb bytes.

import {
	getCurrentUserId,
	getOrMintAnonymousId,
	getOrMintSdkSessionId,
	getReplayStartMs,
	handleLogout,
	identifyIfChanged,
	isValidSdkSessionId,
	publishReplayStartMs,
	reseatSdkSessionId,
} from './identity'
import { createPluginLogger, type PluginLogger, type UseroPlugin, type PluginContext } from './plugin'
import {
	fetchSessionContextMode,
	requestSessionContextConsent,
	type SessionContextMode,
} from './sessionContext'
import { DEFAULT_API_URL, type UseroUser } from './types'

// Re-exported under the public `recording` name so consumers typing the option,
// and anyone rewording the consent prompt, have a single import site.
export {
	SESSION_CONTEXT_CONSENT_COPY as RECORDING_CONSENT_COPY,
	DEFAULT_SESSION_CONTEXT_MODE as DEFAULT_RECORDING_MODE,
	type SessionContextMode as RecordingMode,
} from './sessionContext'

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
	// Flush a chunk every N seconds. Default 3. Smaller = more PUTs but
	// less data lost on tab crash and less time event refs retain detached
	// DOM nodes in memory.
	chunkSeconds?: number
	// Soft cap on buffered events before forcing a flush, regardless of
	// time. Default 1000.
	chunkMaxEvents?: number
	// Soft cap on estimated buffered bytes before forcing a flush. Default
	// 512_000 (~500 KB pre-gzip). Keeps memory pressure bounded on event-heavy
	// pages even when chunkMaxEvents hasn't been hit.
	chunkMaxBytes?: number
	// Max attempts per chunk before giving up. Default 5.
	chunkMaxAttempts?: number
	// Force rrweb to take a fresh full snapshot every N ms. This resets
	// rrweb's internal mirror so detached DOM (e.g. SPA route changes)
	// becomes GC-eligible. Default 60_000.
	checkoutEveryMs?: number
	// API origin. Override for self-hosted or local dev. Defaults to the
	// PluginContext baseUrl threaded through by the widget (plugin mode) or
	// to https://usero.io (standalone mode).
	apiUrl?: string
	// Recording mode override. When set, the SDK does NOT fetch the
	// client's configured mode at init and uses this value for the life of
	// the page. Leave it unset (the default) so the mode follows whatever
	// the client set in their Usero dashboard.
	//
	//   'always' - record ambiently, and snapshot the page at submit time
	//              if no recording happens to be live.
	//   'ask'    - never record ambiently; ask the user at submit time,
	//              before anything is captured.
	//   'never'  - capture nothing; rrweb is never loaded.
	//
	// The server independently enforces the client's configured mode, so
	// this option can only ever be as permissive as the dashboard setting.
	recording?: SessionContextMode

	// ---- Standalone mode only -------------------------------------------
	// The three options below feed `.start()` (recording without the
	// feedback widget). When the instance is instead passed to the widget's
	// `plugins` array, they are ignored: the widget's own clientId / `user`
	// prop / `getUser` callback are authoritative.

	// Your Usero client id. Required for `.start()`; without it standalone
	// start logs an error and no-ops.
	clientId?: string
	// Current user, if known. Pass `null` for an explicitly logged-out
	// visitor. Prefer `getUser` when the user can change mid-session; the
	// SDK re-resolves at session start and chunk boundaries.
	user?: UseroUser | null
	// Getter for the current user. Re-invoked at session start and chunk
	// boundaries so a mid-session login is picked up without any extra
	// wiring. Return null/undefined while logged out.
	getUser?: () => UseroUser | null | undefined
	// Standalone mode: the environment to scope this recording to, same
	// concept as the widget's `environment` prop. Omitted means default/prod.
	environment?: string
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
	checkoutEveryNms?: number
	// rrweb's ErrorHandler: returning true marks the error handled so rrweb
	// does not rethrow / stop recording. Matches the alpha.20 type
	// `(error: unknown) => void | boolean`.
	errorHandler?: (error: unknown) => void | boolean
}

interface RrwebRecordFn {
	(opts: RrwebRecordOptions): () => void
	takeFullSnapshot?: (isCheckout?: boolean) => void
	// rrweb wraps the payload as an EventType.Custom (type 5) event with
	// `data: { tag, payload }` and emits it through the same `emit` callback
	// as every other rrweb event, so it streams in our chunks alongside Meta
	// (type 4) and incremental (type 3) events. Consumers reading the stream
	// resolve the URL-at-moment from these `tag === 'url-change'` events.
	addCustomEvent?: (tag: string, payload: unknown) => void
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
	chunkMaxBytes: number
	chunkMaxAttempts: number
	checkoutEveryMs: number
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
	pendingBytes: number
	pendingFirstTs: number | null
	pendingLastTs: number | null
	// True when the pending buffer holds a FullSnapshot (type 2). A
	// snapshot-bearing chunk is the playback anchor for everything after it, so
	// it is NEVER dropped on queue saturation or the 4MB cap: we'd rather block
	// briefly / split than lose the anchor and leave an unplayable session.
	pendingHasSnapshot: boolean
	lastUploadDropWarnAt: number
	// Count of chunks dropped (queue saturation) since the last successful
	// upload. Sent as a header on the next successful chunk PUT so the
	// viewer can show a "gap here" marker. Reset on success.
	droppedSinceLastUpload: number
	// Wall-clock timestamp of the last snapshot-isolation flush. Used to
	// rate-limit pre-snapshot flushes so SPA route-change snapshot bursts
	// don't trigger a flush storm.
	lastSnapshotFlushAt: number
	nextChunkSeq: number
	uploadQueue: Promise<void>
	pendingUploads: number
	chunkFlushTimer: ReturnType<typeof setInterval> | null
	startTimer: ReturnType<typeof setTimeout> | null
	pageHideHandler: (() => void) | null
	visibilityHandler: (() => void) | null
	shadowUpdateHandler: ((event: Event) => void) | null
	record: RrwebRecord | null
	stopRecording: (() => void) | null
	// Teardown for the SPA URL-change tracker: restores the patched
	// history.pushState / history.replaceState and removes the popstate
	// listener. Null until tracking is wired up, and after teardown.
	stopUrlTracking: (() => void) | null
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
	chunkSeconds: 3,
	chunkMaxEvents: 1000,
	chunkMaxBytes: 512_000,
	chunkMaxAttempts: 5,
	checkoutEveryMs: 60_000,
	apiUrl: '',
}

const SDK_SESSION_STORAGE_KEY = 'usero:session-replay:sdk-session-id'
const HARD_CHUNK_BYTE_CAP = 4 * 1024 * 1024
const MAX_PENDING_UPLOADS = 3
const UPLOAD_DROP_WARN_INTERVAL_MS = 5000
// rrweb EventType.FullSnapshot. We don't import rrweb's enum because rrweb is
// dynamically imported (bundle hygiene), so we'd have to pay the load cost
// just to reference a constant. Magic number matches estimateEventBytes above
// and rrweb's stable public event-type enum.
const RRWEB_EVENT_TYPE_FULL_SNAPSHOT = 2
// rrweb EventType.Meta: carries the page href and viewport size, and is
// emitted immediately before every FullSnapshot. A snapshot-only session
// needs it, otherwise the viewer has no page URL and no canvas size.
const RRWEB_EVENT_TYPE_META = 4
// Hard ceiling on the whole submit-time snapshot attach: load rrweb,
// capture, create the session row, upload one chunk, finalise. Feedback
// capture is the product; page context is a bonus. If the bonus is not
// ready in this long we submit the feedback with nothing attached rather
// than make the user wait.
const SNAPSHOT_ATTACH_BUDGET_MS = 1500
// Slice of that budget allowed for loading rrweb and getting the snapshot
// event out of it, leaving the rest for the three network calls.
const SNAPSHOT_CAPTURE_BUDGET_MS = 700
// Minimum gap between back-to-back snapshot-isolation flushes. Snapshots
// normally fire every checkoutEveryMs (default 60s), but rrweb can emit
// additional ones on SPA route changes via checkoutEveryNms. Keeping this
// below chunkSeconds * 1000 / 2 of the default (3000ms) and well under
// checkoutEveryMs ensures isolation still happens for back-to-back snapshots
// while preventing pathological flush storms.
const SNAPSHOT_ISOLATION_MIN_GAP_MS = 1500

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
		if (existing && isValidSdkSessionId(existing)) return existing
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

// Cheap per-event byte estimate. Avoids JSON.stringify on the hot emit path.
// rrweb EventType: 0=DomContentLoaded, 1=Load, 2=FullSnapshot, 3=IncrementalSnapshot,
// 4=Meta, 5=Custom, 6=Plugin. Full snapshots are the only event class that's
// genuinely large; everything else is well under a KB on average. Numbers
// chosen to over-estimate slightly so chunkMaxBytes stays a safety net.
function estimateEventBytes(event: RrwebEvent): number {
	if (event.type === 2) return 50_000
	if (event.type === 3) return 256
	return 128
}

interface CreateSessionResult {
	accepted: boolean
	sessionReplayId?: string
	dropReason?: string
}

interface CreateSessionBody {
	clientId: string
	sdkSessionId: string
	anonymousId: string
	startUrl?: string
	userAgent?: string
	referrer?: string
	startedAt: string
	environment?: string
	// This session is a single page snapshot taken at feedback-submit
	// time, not an ambient recording. The server treats it differently and
	// uses it to enforce the client's session-context mode.
	snapshotOnly?: boolean
	// The user was asked and said yes. Only meaningful alongside
	// `snapshotOnly`; the server rejects an 'ask'-mode create without it.
	consented?: boolean
}

// Extra create-session fields for the submit-time snapshot path. Absent for
// ambient recordings, which is what the server reads as "not a snapshot".
interface SnapshotSessionFlags {
	snapshotOnly: true
	consented: boolean
}

async function createSession(
	apiUrl: string,
	clientId: string,
	sdkSessionId: string,
	anonymousId: string,
	environment?: string,
	snapshotFlags?: SnapshotSessionFlags,
): Promise<CreateSessionResult | null> {
	try {
		const startUrl =
			typeof window !== 'undefined' && window.location ? window.location.href : undefined
		const userAgent =
			typeof navigator !== 'undefined' && navigator.userAgent ? navigator.userAgent : undefined
		const referrer =
			typeof document !== 'undefined' && document.referrer ? document.referrer : undefined
		const body: CreateSessionBody = {
			clientId,
			sdkSessionId,
			anonymousId,
			startUrl,
			userAgent,
			referrer,
			startedAt: new Date().toISOString(),
		}
		if (environment !== undefined) body.environment = environment
		if (snapshotFlags) {
			body.snapshotOnly = snapshotFlags.snapshotOnly
			body.consented = snapshotFlags.consented
		}
		const res = await fetch(joinUrl(apiUrl, '/api/replay-sessions'), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
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
	droppedBefore: number,
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
			const headers: Record<string, string> = {
				'Content-Type': 'application/octet-stream',
				'X-Usero-Client-Id': clientId,
				'X-Usero-Event-Count': String(eventCount),
				'X-Usero-Duration-Ms': String(Math.max(0, Math.round(durationMs))),
			}
			// Signal a playback gap: how many chunks were dropped (queue
			// saturation) between the previous successful upload and this one.
			// Server-side viewer will use this to render a "missing data" marker.
			if (droppedBefore > 0) headers['X-Usero-Dropped-Before'] = String(droppedBefore)
			const res = await fetch(url, {
				method: 'PUT',
				body: blob,
				headers,
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

// Test seam. rrweb needs a real DOM, which the node test suite does not
// have, so tests swap in a fake recorder here to exercise the snapshot
// path. Always null in production; only `__test__.setRrwebLoader` sets it.
let rrwebLoaderOverride: (() => Promise<RrwebRecord | null>) | null = null

async function loadRrwebRecord(): Promise<RrwebRecord | null> {
	if (rrwebLoaderOverride) return rrwebLoaderOverride()
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

// Decides whether to isolate a FullSnapshot event into its own chunk.
//
// rrweb FullSnapshots are the playback anchor for every subsequent
// incremental event in the same chunk. If a chunk crosses the 4MB gzipped
// hard cap (HARD_CHUNK_BYTE_CAP) it's dropped wholesale, taking the anchor
// with it and breaking playback for up to a full checkoutEveryMs window.
// To mitigate, we ship the snapshot in a near-empty chunk:
//
//   1. Pre-flush: if `pendingEvents` is non-empty, flush it now so the
//      snapshot doesn't inherit the previous up-to-3s of incrementals.
//   2. Caller pushes the snapshot event onto `pendingEvents`.
//   3. Post-flush (if `didIsolate`): caller calls `scheduleChunkUpload`
//      again so the snapshot ships solo, not bundled with the next up-to-3s
//      of post-snapshot incrementals.
//
// Both pre- and post-flush share a single rate-limit window
// (`lastSnapshotFlushAt` + `SNAPSHOT_ISOLATION_MIN_GAP_MS`) so SPA route-
// change snapshot bursts can't trigger a flush storm. If the gate is
// closed, neither flush fires; if open, both fire and the watermark is
// updated. Pre-flush is conditional on a non-empty buffer (nothing to
// flush otherwise); post-flush is unconditional once the gate is open
// because the goal is to ship the snapshot solo regardless.
//
// Returns `{ didIsolate }` so the caller knows whether to do the
// post-flush after pushing the event.
export function maybeIsolateSnapshot(
	store: ReplayStore,
	ctx: PluginContext,
	event: { type: number },
	now: number,
): { didIsolate: boolean } {
	if (event.type !== RRWEB_EVENT_TYPE_FULL_SNAPSHOT) return { didIsolate: false }
	if (now - store.lastSnapshotFlushAt < SNAPSHOT_ISOLATION_MIN_GAP_MS) {
		return { didIsolate: false }
	}
	if (store.pendingEvents.length > 0) {
		scheduleChunkUpload(store, ctx)
	}
	store.lastSnapshotFlushAt = now
	return { didIsolate: true }
}

function scheduleChunkUpload(store: ReplayStore, ctx: PluginContext): void {
	if (!store.sessionReplayId) return
	if (store.pendingEvents.length === 0) return
	// Queue saturation. We bound memory by refusing to enqueue more work, but a
	// snapshot-bearing buffer is the playback anchor and must NEVER be dropped:
	// losing it makes every subsequent incremental unplayable. So we only drop
	// NON-snapshot buffers here; a snapshot buffer falls through and is enqueued
	// even past MAX_PENDING_UPLOADS (the queue is a serial promise chain, so this
	// just means it waits its turn rather than racing memory up unboundedly).
	if (store.pendingUploads >= MAX_PENDING_UPLOADS && !store.pendingHasSnapshot) {
		const now = Date.now()
		if (now - store.lastUploadDropWarnAt > UPLOAD_DROP_WARN_INTERVAL_MS) {
			store.lastUploadDropWarnAt = now
			ctx.logger.warn(
				`upload queue full (${store.pendingUploads} in-flight), dropping non-snapshot chunk to bound memory`,
			)
		}
		store.pendingEvents = []
		store.pendingBytes = 0
		store.pendingFirstTs = null
		store.pendingLastTs = null
		// Track for the next successful chunk so the viewer can render a gap.
		store.droppedSinceLastUpload += 1
		return
	}
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
	const hasSnapshot = store.pendingHasSnapshot
	const seq = store.nextChunkSeq
	store.nextChunkSeq += 1
	store.pendingEvents = []
	store.pendingBytes = 0
	store.pendingFirstTs = null
	store.pendingLastTs = null
	store.pendingHasSnapshot = false

	const sessionReplayId = store.sessionReplayId
	const apiUrl = store.options.apiUrl
	const clientId = store.clientId
	const maxAttempts = store.options.chunkMaxAttempts

	const droppedBefore = store.droppedSinceLastUpload
	store.pendingUploads += 1
	store.uploadQueue = store.uploadQueue.then(async () => {
		try {
			if (store.cancelled) return
			const json = JSON.stringify(events)
			const bytes = await gzipBytes(json)
			if (bytes.byteLength > HARD_CHUNK_BYTE_CAP) {
				// A snapshot chunk is the playback anchor: dropping it leaves
				// every following incremental unplayable, which is exactly the
				// "Meta + incrementals, no snapshot" ghost row we're fixing.
				// Snapshot isolation already ships snapshots near-empty, so a
				// >4MB gzipped snapshot is pathological; still, attempt the
				// upload rather than discard the anchor. The server route caps
				// at MAX_CHUNK_BYTES and will 413 if it truly can't take it, but
				// we never voluntarily throw the anchor away.
				if (hasSnapshot) {
					ctx.logger.error(
						`snapshot chunk ${seq} exceeds 4MB hard cap (${bytes.byteLength} bytes); uploading anyway to preserve the playback anchor`,
					)
				} else {
					ctx.logger.error(
						`chunk ${seq} exceeds 4MB hard cap (${bytes.byteLength} bytes), dropping`,
					)
					// Surface the drop on the next successful chunk so the viewer
					// can render a gap marker. Without this, oversized chunks
					// vanish without trace server-side.
					store.droppedSinceLastUpload += 1
					return
				}
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
				droppedBefore,
			)
			if (hasSnapshot && !result.ok) {
				// We uploaded an oversized snapshot chunk anyway to preserve the
				// anchor, but the upload still failed after retries. The anchor
				// is lost, so record a gap for the viewer just like a real drop.
				store.droppedSinceLastUpload += 1
			}
			if (result.ok && droppedBefore > 0) {
				// Subtract what we just reported, rather than zeroing, so any
				// drops that happened while this chunk was in flight still
				// surface on the next successful upload.
				store.droppedSinceLastUpload = Math.max(
					0,
					store.droppedSinceLastUpload - droppedBefore,
				)
			}
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
	// Restore patched history methods + remove popstate listener before we
	// drop the record reference, so the SPA URL-change patch never outlives
	// the recording.
	stopUrlChangeTracking(store)
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

// rrweb tag for SPA URL-change custom events. Consumers (replay viewer, AI
// analysis) key off this exact string inside type-5 Custom events to resolve
// the URL the user was on at any moment, not just the initial Meta (type 4)
// href captured at recording start.
const URL_CHANGE_TAG = 'url-change'

// Captures client-side route changes (history.pushState / replaceState /
// popstate) as rrweb custom events so the replay stream carries the URL after
// the initial page load. rrweb only emits a Meta event with the URL at
// recording START, so without this every SPA navigation is invisible in the
// recording.
//
// Patches the two history methods by wrapping the originals (call through,
// then emit) and listens for popstate. Emits once immediately so the current
// SPA URL is anchored. Returns a teardown that restores the original methods
// and removes the listener, so the patch never leaks across the widget's
// lifecycle. Re-entrancy is guarded by `store.stopUrlTracking`: if tracking is
// already wired up, this is a no-op (prevents double-patching if the plugin
// inits more than once on the same page).
//
// All work is wrapped so a history-patch failure (locked-down history object,
// frozen prototype) never breaks recording: it logs and leaves recording
// untouched.
function startUrlChangeTracking(store: ReplayStore, ctx: PluginContext): void {
	if (typeof window === 'undefined') return
	if (store.stopUrlTracking) return
	const record = store.record
	const addCustomEvent = record?.addCustomEvent
	if (!record || typeof addCustomEvent !== 'function') return

	const emitUrl = (): void => {
		if (store.stopped || store.cancelled) return
		try {
			addCustomEvent.call(record, URL_CHANGE_TAG, { href: window.location.href })
		} catch (err) {
			ctx.logger.warn('url-change addCustomEvent threw', err)
		}
	}

	try {
		const history = window.history
		const originalPushState = history.pushState
		const originalReplaceState = history.replaceState

		const patchedPushState: History['pushState'] = function patchedPushState(
			this: History,
			...args
		) {
			const result = originalPushState.apply(this, args)
			emitUrl()
			return result
		}
		const patchedReplaceState: History['replaceState'] = function patchedReplaceState(
			this: History,
			...args
		) {
			const result = originalReplaceState.apply(this, args)
			emitUrl()
			return result
		}

		history.pushState = patchedPushState
		history.replaceState = patchedReplaceState

		const onPopState = (): void => emitUrl()
		window.addEventListener('popstate', onPopState)

		store.stopUrlTracking = (): void => {
			try {
				// Only restore if nothing else re-patched on top of us, so we
				// don't clobber a later wrapper (e.g. the host's own router
				// instrumentation) by reverting to a stale original.
				if (history.pushState === patchedPushState) history.pushState = originalPushState
				if (history.replaceState === patchedReplaceState) {
					history.replaceState = originalReplaceState
				}
				window.removeEventListener('popstate', onPopState)
			} catch (err) {
				ctx.logger.warn('url-change teardown threw', err)
			}
		}

		// Anchor the current SPA URL immediately. Meta also carries it at
		// start, but this keeps the resolver logic uniform (always read the
		// latest url-change event) and covers hosts that delay the first
		// route render.
		emitUrl()
	} catch (err) {
		ctx.logger.warn('url-change tracking setup threw', err)
	}
}

function stopUrlChangeTracking(store: ReplayStore): void {
	if (store.stopUrlTracking) {
		store.stopUrlTracking()
		store.stopUrlTracking = null
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
					// FullSnapshot isolation: ship the snapshot in a near-empty
					// chunk so the 4MB hard cap can't drop the playback anchor.
					// `maybeIsolateSnapshot` handles the pre-flush + rate-limit;
					// we do the post-flush below so the snapshot ships solo
					// instead of inheriting up to chunkSeconds of trailing
					// incrementals. See the helper's doc comment for details.
					const { didIsolate } = maybeIsolateSnapshot(store, ctx, event, Date.now())
					store.pendingEvents.push(event)
					if (event.type === RRWEB_EVENT_TYPE_FULL_SNAPSHOT) {
						// Mark this buffer as snapshot-bearing so scheduleChunkUpload
						// refuses to drop it on saturation or the 4MB cap.
						store.pendingHasSnapshot = true
					}
					// Hot path: rrweb fires hundreds of events/sec on busy SPAs.
					// JSON.stringify-per-event burns CPU we don't have, and .length
					// is UTF-16 units (under-counts non-ASCII by ~2x) so it was
					// never a real byte count anyway. Use a per-type heuristic:
					// full snapshots are huge, mutations are mid, everything else
					// is cheap. chunkMaxBytes is documented as approximate.
					store.pendingBytes += estimateEventBytes(event)
					if (store.pendingFirstTs === null) store.pendingFirstTs = event.timestamp
					store.pendingLastTs = event.timestamp
					if (didIsolate) {
						// Post-flush: the snapshot we just pushed ships in its
						// own chunk so it doesn't inherit the next chunkSeconds
						// of incremental mutations and risk crossing the 4MB cap.
						scheduleChunkUpload(store, ctx)
					} else if (
						store.pendingEvents.length >= store.options.chunkMaxEvents ||
						store.pendingBytes >= store.options.chunkMaxBytes
					) {
						scheduleChunkUpload(store, ctx)
					}
				},
				maskAllInputs: store.options.maskAllInputs,
				maskTextSelector: store.options.maskTextSelector || undefined,
				inlineStylesheet: store.options.inlineStylesheet,
				blockSelector: store.options.blockSelector,
				sampling: store.options.sampling,
				checkoutEveryNms: store.options.checkoutEveryMs,
				// Swallow throws on rrweb's emit path so a single bad event can't
				// abort the whole recording. The known offender: the
				// adoptedStyleSheets observer can fire an incremental snapshot
				// before the first FullSnapshot exists, so the checkout branch
				// reads lastFullSnapshotEvent.timestamp on undefined and throws
				// (TypeError: Cannot read properties of undefined). Returning
				// true marks the error handled so rrweb does not rethrow and stop.
				errorHandler: (error: unknown): boolean => {
					ctx.logger.warn('rrweb emit error swallowed', error)
					return true
				},
			})
			store.stopRecording = stop
			store.record = record
			// Capture SPA route changes as custom events so the replay stream
			// knows the URL after the first page load.
			startUrlChangeTracking(store, ctx)
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

// POSTs the finalise call for a session. Shared by the ambient recording
// teardown and the submit-time snapshot path, which has no store to hang
// off. Resolves once the request settles; never rejects.
async function postFinalise(
	apiUrl: string,
	clientId: string,
	sessionReplayId: string,
	logger: PluginLogger,
): Promise<void> {
	const url = joinUrl(
		apiUrl,
		`/api/replay-sessions/${encodeURIComponent(sessionReplayId)}/finalise`,
	)
	try {
		await fetch(url, {
			method: 'POST',
			body: JSON.stringify({ clientId, endedAt: new Date().toISOString() }),
			headers: { 'Content-Type': 'application/json' },
			keepalive: true,
		})
	} catch (err) {
		logger.warn('finalise fetch failed', err)
	}
}

function finalise(store: ReplayStore, ctx: PluginContext, opts: { useBeacon: boolean }): void {
	if (!store.sessionReplayId) return
	if (store.pendingEvents.length > 0) flushPendingChunk(store, ctx)
	const sessionReplayId = store.sessionReplayId
	if (opts.useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
		const url = joinUrl(
			store.options.apiUrl,
			`/api/replay-sessions/${encodeURIComponent(sessionReplayId)}/finalise`,
		)
		const body = JSON.stringify({ clientId: store.clientId, endedAt: new Date().toISOString() })
		try {
			const blob = new Blob([body], { type: 'application/json' })
			navigator.sendBeacon(url, blob)
			return
		} catch (err) {
			ctx.logger.warn('finalise sendBeacon threw', err)
		}
	}
	void postFinalise(store.options.apiUrl, store.clientId, sessionReplayId, ctx.logger)
}

// ---- Submit-time page snapshot -----------------------------------------
//
// When feedback is submitted and no ambient recording is live (sampled
// out, bot-gated, or 'ask' mode where we deliberately never recorded), we
// can still give the team the single most useful frame: what the page
// looked like at the moment the user complained.
//
// The capture is one rrweb Meta + FullSnapshot pair, taken with the SAME
// masking defaults the ambient recorder uses, then shipped through the
// existing session plumbing (create -> chunk seq 0 -> finalise) with
// `snapshotOnly: true`. No new endpoint, and the viewer plays it back as a
// one-frame session.

// The masking-relevant subset of the recorder options. Kept as its own
// type so the snapshot path provably cannot drift from the recorder: both
// read the same resolved values.
interface SnapshotMaskingOptions {
	maskAllInputs: boolean
	maskTextSelector: string
	inlineStylesheet: boolean
	blockSelector: string
}

// Starts rrweb, keeps only the Meta + FullSnapshot events, and stops it
// again as soon as the snapshot lands. Returns null if rrweb will not load,
// record() throws, or no snapshot arrives inside `budgetMs`.
export async function captureSnapshotEvents(
	masking: SnapshotMaskingOptions,
	logger: PluginLogger,
	budgetMs: number,
): Promise<RrwebEvent[] | null> {
	const record = await loadRrwebRecord()
	if (!record) {
		logger.warn('rrweb failed to load, page snapshot skipped')
		return null
	}
	return new Promise<RrwebEvent[] | null>(resolve => {
		const events: RrwebEvent[] = []
		let hasSnapshot = false
		let settled = false
		let stopFn: (() => void) | null = null
		let stopped = false
		let timer: ReturnType<typeof setTimeout> | null = null

		// rrweb calls `emit` synchronously from inside `record()`, so the
		// stop function may not be assigned yet when we settle. Stopping is
		// therefore idempotent and re-run once record() returns.
		const stopRecorder = (): void => {
			if (stopped || !stopFn) return
			stopped = true
			try {
				stopFn()
			} catch {
				// Already stopped.
			}
		}
		const finish = (value: RrwebEvent[] | null): void => {
			if (settled) return
			settled = true
			if (timer !== null) clearTimeout(timer)
			stopRecorder()
			resolve(value)
		}

		timer = setTimeout(() => {
			logger.warn('page snapshot timed out before rrweb produced a full snapshot')
			finish(null)
		}, budgetMs)

		try {
			stopFn = record({
				emit: event => {
					if (settled) return
					if (
						event.type !== RRWEB_EVENT_TYPE_META &&
						event.type !== RRWEB_EVENT_TYPE_FULL_SNAPSHOT
					) {
						return
					}
					events.push(event)
					if (event.type === RRWEB_EVENT_TYPE_FULL_SNAPSHOT) hasSnapshot = true
					// The FullSnapshot is the whole point and Meta always
					// precedes it, so the pair is complete the moment the
					// snapshot lands.
					if (hasSnapshot) finish(events)
				},
				maskAllInputs: masking.maskAllInputs,
				maskTextSelector: masking.maskTextSelector || undefined,
				inlineStylesheet: masking.inlineStylesheet,
				blockSelector: masking.blockSelector,
				errorHandler: (error: unknown): boolean => {
					logger.warn('rrweb emit error swallowed during page snapshot', error)
					return true
				},
			})
		} catch (err) {
			logger.error('rrweb record() threw during page snapshot', err)
			finish(null)
			return
		}
		// Covers the synchronous-emit case above.
		if (settled) stopRecorder()
	})
}

interface SnapshotUploadParams {
	apiUrl: string
	clientId: string
	sdkSessionId: string
	anonymousId: string
	environment?: string
	events: RrwebEvent[]
	// True only when the user was shown the consent prompt and chose to
	// include. Forwarded verbatim; the server refuses an 'ask'-mode create
	// without it.
	consented: boolean
	logger: PluginLogger
}

// Ships a captured snapshot as a snapshot-only session: create, one chunk
// at seq 0, finalise. Returns the sessionReplayId, or null if the server
// declined the session or the chunk failed to land (an empty session row
// is worse than no link, so we do not attach one).
async function uploadSnapshotSession(params: SnapshotUploadParams): Promise<string | null> {
	const { apiUrl, clientId, events, logger } = params
	const created = await createSession(
		apiUrl,
		clientId,
		params.sdkSessionId,
		params.anonymousId,
		params.environment,
		{ snapshotOnly: true, consented: params.consented },
	)
	if (!created) {
		logger.warn('snapshot session create failed')
		return null
	}
	if (!created.accepted) {
		logger.info(`snapshot session declined: ${created.dropReason ?? 'unknown'}`)
		return null
	}
	if (!created.sessionReplayId) {
		logger.error('server accepted snapshot session but returned no sessionReplayId')
		return null
	}
	const sessionReplayId = created.sessionReplayId
	const bytes = await gzipBytes(JSON.stringify(events))
	const firstTs = events[0]?.timestamp ?? 0
	const lastTs = events[events.length - 1]?.timestamp ?? firstTs
	// One attempt only: the caller is holding a feedback submit open, so a
	// retry with backoff would blow the budget and get discarded anyway.
	const result = await uploadChunk(
		apiUrl,
		sessionReplayId,
		clientId,
		0,
		bytes,
		events.length,
		Math.max(0, lastTs - firstTs),
		logger,
		1,
		0,
	)
	if (!result.ok) {
		logger.warn('snapshot chunk upload failed; not attaching the session')
		return null
	}
	await postFinalise(apiUrl, clientId, sessionReplayId, logger)
	return sessionReplayId
}

export interface CurrentSessionHandle {
	id: string
	offsetMs: number
}

// What `sessionReplay()` returns: a regular widget plugin that ALSO exposes
// the standalone lifecycle. Passing it to the widget's `plugins` array and
// calling `.start()` are both valid uses of the same object.
export interface SessionReplayInstance extends UseroPlugin {
	// Begin recording without the widget. Requires `clientId` in the factory
	// options. Idempotent: calling it while a recording is live (from this
	// instance or any other on the page) is a no-op. No-op during SSR.
	start: () => void
	// Stop recording: flush buffered events, finalise the session
	// server-side, and tear down listeners. Calling `start()` afterwards
	// begins a NEW replay session (same per-tab sdkSessionId, so the server
	// still stitches them to the same visit).
	stop: () => void
}

// ---- Page-wide single-recording coordination ---------------------------
//
// At most one rrweb recorder may run per page: two recorders double the CPU
// and upload cost and produce two half-useful replays. The live recording
// registers itself in a globalThis slot (NOT module scope) so that even
// when this module is bundled twice (e.g. `@usero/sdk/replay` in app code
// plus `@usero/sdk/plugins/session-replay` inside a widget bundle, or CJS +
// ESM copies), all copies observe the same "is something already
// recording?" answer. A slot whose store is stopped/cancelled counts as
// free, so finished sessions never block a new one.

interface GlobalReplaySlot {
	store: ReplayStore
	// Lets a later-mounting widget route chunk-boundary user resolution
	// through ITS resolveUser (host `user` prop / `getUser`), which is
	// fresher than whatever the standalone start was configured with.
	setResolveUserDelegate: (fn: (() => void) | null) => void
}

// Deliberate widening of globalThis: the slot is our own well-known
// property, invisible to consumers and validated structurally on read.
type GlobalWithReplaySlot = typeof globalThis & {
	__useroSessionReplayActive__?: GlobalReplaySlot
}

function readGlobalSlot(): GlobalReplaySlot | null {
	const slot = (globalThis as GlobalWithReplaySlot).__useroSessionReplayActive__
	if (!slot) return null
	if (slot.store.stopped || slot.store.cancelled) return null
	return slot
}

function writeGlobalSlot(slot: GlobalReplaySlot): void {
	;(globalThis as GlobalWithReplaySlot).__useroSessionReplayActive__ = slot
}

// Minimal PluginContext for standalone mode: no widget, no DOM. Identity
// accessors read the same single source of truth in identity.ts that the
// widget threads through, so a replay started standalone and a widget
// mounted later agree on sdkSessionId / anonymousId / userId.
function createStandaloneContext(
	clientId: string,
	apiUrl: string,
	logger: ReturnType<typeof createPluginLogger>,
	resolveUser: () => void,
	environment?: string,
): PluginContext {
	let store: unknown
	return {
		clientId,
		baseUrl: apiUrl,
		environment,
		logger,
		getStore: <T,>() => store as T | undefined,
		setStore: <T,>(value: T) => {
			store = value
		},
		resolveUser,
		getSdkSessionId: () => getOrMintSdkSessionId(),
		reseatSdkSessionId: (id: string) => reseatSdkSessionId(id),
		getAnonymousId: () => getOrMintAnonymousId(),
		getUserId: () => getCurrentUserId(),
		getReplayStartMs: () => getReplayStartMs(),
		publishReplayStartMs: (epochMs: number) => publishReplayStartMs(epochMs),
	}
}

// Standalone user resolution: mirrors the widget's `user`-prop-over-getUser
// precedence and its logout handling (id -> null rotates the anonymousId so
// the next anonymous trail does not merge into the previous person).
// identifyIfChanged dedupes by fingerprint, so repeated calls with the same
// user are network no-ops.
function createStandaloneUserResolver(
	transport: { apiUrl: string; clientId: string },
	options: Pick<SessionReplayOptions, 'user' | 'getUser'>,
): () => void {
	let lastUserId: string | null = null
	return () => {
		let resolved: UseroUser | null
		try {
			resolved = options.user !== undefined ? options.user : (options.getUser?.() ?? null)
		} catch {
			// getUser threw; the host's auth state is likely mid-flight.
			// Leave identity as-is, the next boundary re-resolves.
			return
		}
		if (resolved) {
			void identifyIfChanged(transport, resolved)
			lastUserId = resolved.id
		} else if (lastUserId !== null) {
			handleLogout()
			lastUserId = null
		}
	}
}

export function sessionReplay(options: SessionReplayOptions = {}): SessionReplayInstance {
	// Standalone-only options never reach ResolvedOptions; the rest merge
	// over the defaults exactly as before.
	const {
		clientId: standaloneClientId,
		user,
		getUser,
		environment: standaloneEnvironment,
		recording: sessionContextOverride,
		...replayOptions
	} = options
	const merged: ResolvedOptions = {
		...DEFAULTS,
		...replayOptions,
		sampling: { ...DEFAULTS.sampling, ...(replayOptions.sampling ?? {}) },
	}

	// Per-instance lifecycle. `phase` is the public state machine: start()
	// only acts from idle/stopped, stop() only from running. `startedAs`
	// decides ownership: a widget unmount (onDestroy) must not kill a
	// recording it merely adopted from a standalone start.
	type Phase = 'idle' | 'running' | 'stopped'
	let phase: Phase = 'idle'
	let startedAs: 'standalone' | 'plugin' | null = null
	let currentStore: ReplayStore | null = null
	let currentCtx: PluginContext | null = null
	// When a widget mounts while this instance records standalone, chunk
	// boundaries resolve the user through the widget instead of the
	// standalone options (set on adoption, cleared on widget destroy).
	let resolveUserDelegate: (() => void) | null = null
	// True when this instance was registered as a widget plugin while a
	// DIFFERENT instance's recording was live; onDestroy then only detaches
	// the user-resolution delegate it lent to that recording.
	let delegatedToGlobal = false
	const standaloneLogger = createPluginLogger('session-replay')

	// The client's session-context mode, fetched ONCE per page load and
	// held in memory only. Kicked off at init so the submit path almost
	// never waits on it; both the bootstrap and the submit path await this
	// same promise, so they can never disagree about the mode.
	let modePromise: Promise<SessionContextMode> | null = null
	const resolveSessionContextMode = (
		apiUrl: string,
		clientId: string,
	): Promise<SessionContextMode> => {
		if (sessionContextOverride) return Promise.resolve(sessionContextOverride)
		modePromise ??= fetchSessionContextMode(apiUrl, clientId)
		return modePromise
	}

	// Captures the page and ships it as a snapshot-only session, bounded by
	// SNAPSHOT_ATTACH_BUDGET_MS end to end. Returns the submission patch, or
	// undefined if anything failed or ran long, in which case the feedback
	// submits with no page context attached.
	//
	// `consented` is only ever true on the 'ask' path, and this function is
	// only reached there AFTER the user said yes, so a decline means no
	// capture ever happens rather than a capture we throw away.
	const attachPageSnapshot = async (
		ctx: PluginContext,
		apiUrl: string,
		consented: boolean,
	): Promise<{ sessionReplayId: string; replayOffsetMs: number } | undefined> => {
		const work = (async (): Promise<string | null> => {
			const events = await captureSnapshotEvents(
				{
					maskAllInputs: merged.maskAllInputs,
					maskTextSelector: merged.maskTextSelector,
					inlineStylesheet: merged.inlineStylesheet,
					blockSelector: merged.blockSelector,
				},
				ctx.logger,
				SNAPSHOT_CAPTURE_BUDGET_MS,
			)
			if (!events || events.length === 0) return null
			return uploadSnapshotSession({
				apiUrl,
				clientId: ctx.clientId,
				sdkSessionId: ctx.getSdkSessionId ? ctx.getSdkSessionId() : mintSdkSessionId(),
				anonymousId: ctx.getAnonymousId ? ctx.getAnonymousId() : getOrMintAnonymousId(),
				environment: standaloneEnvironment ?? ctx.environment,
				events,
				consented,
				logger: ctx.logger,
			})
		})()
		// Whichever finishes first wins. If the budget wins, any in-flight
		// upload is simply not awaited: the session still lands server-side
		// but this submission goes out without it.
		const timeout = new Promise<null>(resolve => {
			setTimeout(() => resolve(null), SNAPSHOT_ATTACH_BUDGET_MS)
		})
		const sessionReplayId = await Promise.race([
			work.catch(err => {
				ctx.logger.warn('page snapshot attach failed', err)
				return null
			}),
			timeout,
		])
		if (!sessionReplayId) return undefined
		// A snapshot is a single frame taken at the moment of submit, so
		// the feedback sits at the very start of it.
		return { sessionReplayId, replayOffsetMs: 0 }
	}

	const removeListeners = (store: ReplayStore): void => {
		if (store.startTimer) {
			clearTimeout(store.startTimer)
			store.startTimer = null
		}
		if (store.pageHideHandler) {
			window.removeEventListener('pagehide', store.pageHideHandler)
			store.pageHideHandler = null
		}
		if (store.visibilityHandler) {
			document.removeEventListener('visibilitychange', store.visibilityHandler)
			store.visibilityHandler = null
		}
		if (store.shadowUpdateHandler) {
			window.removeEventListener('usero:shadow-update', store.shadowUpdateHandler)
			store.shadowUpdateHandler = null
		}
	}

	// The whole recording bootstrap (sample gate, listeners, session create,
	// rrweb start). Identical for both modes; only the ctx differs.
	const startWithContext = (ctx: PluginContext): void => {
			if (typeof window === 'undefined') return

			const apiUrl = merged.apiUrl || ctx.baseUrl
			if (!apiUrl) {
				ctx.logger.error('session-replay needs an apiUrl (via options or PluginContext)')
				return
			}
			// Kick the config fetch off now, before the sample gate, so the
			// mode is resolved even on a run that never records and the
			// submit path does not pay for it. Fire and forget: begin()
			// awaits the same promise below.
			void resolveSessionContextMode(apiUrl, ctx.clientId)

			if (merged.sampleRate < 1 && Math.random() >= merged.sampleRate) {
				ctx.logger.debug('skipped by sampleRate')
				return
			}
			// Resolve the core-owned per-tab id LAZILY (at createSession time,
			// inside begin() below), NOT once here at onInit. user-test's resume
			// path calls reseatSdkSessionId() during ITS onInit; if a consumer
			// registers [sessionReplay(), userTest()], session-replay's onInit
			// runs FIRST and would capture the pre-reseat id, writing the live
			// replay row under the stale id and breaking the audio<->replay join
			// regardless of plugin order. getSdkSessionId() reads through the
			// in-memory cache that reseatSdkSessionId() updates, so reading it at
			// createSession time honours a later re-seat no matter the order.
			const resolveSdkSessionId = (): string =>
				ctx.getSdkSessionId ? ctx.getSdkSessionId() : mintSdkSessionId()
			// Mint or read the cross-session anonymousId. Cached in module
			// scope after the first call, so this stays O(1) on hot paths.
			const anonymousId = getOrMintAnonymousId()

			const store: ReplayStore = {
				options: { ...merged, apiUrl },
				clientId: ctx.clientId,
				// Filled in lazily at createSession time (see resolveSdkSessionId)
				// so a user-test re-seat during a later onInit is honoured.
				sdkSessionId: '',
				sessionReplayId: null,
				recordingStartedAt: null,
				pendingEvents: [],
				pendingBytes: 0,
				pendingFirstTs: null,
				pendingLastTs: null,
				pendingHasSnapshot: false,
				lastUploadDropWarnAt: 0,
				droppedSinceLastUpload: 0,
				lastSnapshotFlushAt: 0,
				nextChunkSeq: 0,
				uploadQueue: Promise.resolve(),
				pendingUploads: 0,
				chunkFlushTimer: null,
				startTimer: null,
				pageHideHandler: null,
				visibilityHandler: null,
				shadowUpdateHandler: null,
				record: null,
				stopRecording: null,
				stopUrlTracking: null,
				loadInProgress: false,
				cancelled: false,
				stopped: false,
			}
			ctx.setStore(store)
			currentStore = store
			currentCtx = ctx
			// Claim the page-wide recording slot the moment a store exists
			// (before the async server handshake), so a concurrently mounting
			// widget can never race a second recorder into existence.
			writeGlobalSlot({
				store,
				setResolveUserDelegate: fn => {
					resolveUserDelegate = fn
				},
			})

			const onShadowUpdate = (): void => scheduleShadowSnapshot(store, ctx)
			store.shadowUpdateHandler = onShadowUpdate
			window.addEventListener('usero:shadow-update', onShadowUpdate)

			// Shared unload backstop for both pagehide and visibilitychange.
			// The `store.stopped` short-circuit makes it idempotent: whichever
			// of the two fires first finalises + stops rrweb, the other (and any
			// later onDestroy) becomes a no-op, so we never double-finalise.
			const stopOnUnload = (): void => {
				if (store.stopped) return
				finalise(store, ctx, { useBeacon: true })
				store.stopped = true
				stopRrweb(store)
			}
			store.pageHideHandler = stopOnUnload
			window.addEventListener('pagehide', stopOnUnload)

			// visibilitychange -> hidden is the reliable mobile backstop:
			// iOS often tears down a backgrounded tab without ever firing
			// pagehide, which used to leave the replay un-finalised (no
			// endedAt). visibilitychange fires consistently on backgrounding, so
			// flushing + finalising here closes that gap. Guarded by the same
			// idempotent stopOnUnload.
			const onVisibilityChange = (): void => {
				if (document.visibilityState !== 'hidden') return
				stopOnUnload()
			}
			store.visibilityHandler = onVisibilityChange
			document.addEventListener('visibilitychange', onVisibilityChange)

			const begin = async (): Promise<void> => {
				if (store.cancelled) return
				// Ambient recording is only allowed in 'always' mode. In 'ask'
				// we wait to be invited at submit time; in 'never' we do
				// nothing at all. Either way we bail BEFORE creating the
				// session row and before startRecording, so rrweb is never
				// loaded and no bytes leave the browser.
				const mode = await resolveSessionContextMode(apiUrl, ctx.clientId)
				if (mode !== 'always') {
					ctx.logger.info(`ambient recording off: recording is set to '${mode}'`)
					store.stopped = true
					removeListeners(store)
					return
				}
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
				// Read the id NOW (not at onInit) so a user-test resume re-seat
				// that ran in a later plugin's onInit is reflected here.
				const sdkSessionId = resolveSdkSessionId()
				store.sdkSessionId = sdkSessionId
				// Precedence: the standalone option wins if set, else the
				// widget-provided environment from PluginContext. Either may be
				// absent, in which case createSession omits it (server defaults).
				const env = standaloneEnvironment ?? ctx.environment
				const created = await createSession(apiUrl, ctx.clientId, sdkSessionId, anonymousId, env)
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
				// Publish the recording start epoch into the core so other
				// plugins (user-test) can compute their offset into this
				// recording without importing the replay module. No-op if the
				// host predates the accessor.
				ctx.publishReplayStartMs?.(store.recordingStartedAt)
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
	}

	const instance: SessionReplayInstance = {
		name: 'session-replay',
		onInit(ctx) {
			if (typeof window === 'undefined') return
			if (phase === 'running' && currentStore && !currentStore.stopped && !currentStore.cancelled) {
				// This same instance is already recording (started standalone
				// before the widget mounted). Adopt instead of restarting:
				// hand the widget ctx the live store so onFeedbackSubmit /
				// getCurrentSession link feedback to the running recording,
				// and route chunk-boundary user resolution through the widget
				// (its `user` prop / `getUser` is fresher than the standalone
				// options snapshot).
				ctx.setStore(currentStore)
				resolveUserDelegate = ctx.resolveUser ?? null
				return
			}
			const liveSlot = readGlobalSlot()
			if (liveSlot) {
				// A DIFFERENT replay instance is already recording this page.
				// Never start a second recorder; lend this widget's user
				// resolution to the live recording and let onFeedbackSubmit
				// fall back to it for linkage.
				ctx.logger.info(
					'another session-replay recording is live on this page; linking to it instead of double-recording',
				)
				liveSlot.setResolveUserDelegate(ctx.resolveUser ?? null)
				delegatedToGlobal = true
				return
			}
			phase = 'running'
			startedAs = 'plugin'
			startWithContext(ctx)
		},
		async onFeedbackSubmit(ctx) {
			// Fall back to the page-wide live recording when this ctx has no
			// store of its own (widget mounted while another instance's
			// standalone recording was running), so feedback still deep-links.
			const store = ctx.getStore<ReplayStore>() ?? readGlobalSlot()?.store
			if (store && !store.cancelled && !store.stopped && store.sessionReplayId) {
				const offsetMs =
					store.recordingStartedAt !== null
						? Math.max(0, Date.now() - store.recordingStartedAt)
						: 0
				return { sessionReplayId: store.sessionReplayId, replayOffsetMs: offsetMs }
			}

			// No live recording: sampled out, bot-gated, never started, or
			// 'ask' mode where we deliberately never recorded. What we do
			// next is entirely the client's session-context mode.
			if (typeof window === 'undefined') return undefined
			const apiUrl = merged.apiUrl || ctx.baseUrl || DEFAULT_API_URL
			const mode = await resolveSessionContextMode(apiUrl, ctx.clientId)
			if (mode === 'never') return undefined
			if (mode === 'ask') {
				// Ask BEFORE capturing. A decline means the snapshot is never
				// taken, so there is no copy of it anywhere to discard, and
				// nothing about this page ever reaches the network.
				const consented = await requestSessionContextConsent({ logger: ctx.logger })
				if (!consented) return undefined
				return attachPageSnapshot(ctx, apiUrl, true)
			}
			return attachPageSnapshot(ctx, apiUrl, false)
		},
		onDestroy(ctx) {
			if (delegatedToGlobal) {
				// We only lent our resolveUser to someone else's recording.
				// Detach it; the recording itself is not ours to stop.
				readGlobalSlot()?.setResolveUserDelegate(null)
				delegatedToGlobal = false
				return
			}
			if (startedAs === 'standalone') {
				// The widget merely adopted a standalone-started recording.
				// Recording is page-scoped and outlives the widget; only the
				// widget's user-resolution delegate goes away with it.
				resolveUserDelegate = null
				return
			}
			const store = ctx.getStore<ReplayStore>() ?? currentStore
			if (!store) return
			store.cancelled = true
			removeListeners(store)
			// SPA route change / React unmount: send a finalise so the
			// server stamps endedAt. fetch+keepalive is fine here since we
			// aren't necessarily in a pagehide path.
			if (store.sessionReplayId && !store.stopped) {
				finalise(store, ctx, { useBeacon: false })
			}
			store.stopped = true
			stopRrweb(store)
			store.pendingEvents.length = 0
			store.pendingBytes = 0
			store.record = null
			phase = 'stopped'
			startedAs = null
			currentStore = null
			currentCtx = null
		},
		start() {
			if (typeof window === 'undefined') return
			if (phase === 'running') return
			if (readGlobalSlot()) {
				standaloneLogger.debug(
					'start() ignored: a session-replay recording is already live on this page',
				)
				return
			}
			if (!standaloneClientId) {
				standaloneLogger.error(
					'start() needs a clientId: sessionReplay({ clientId: "YOUR_CLIENT_ID" })',
				)
				return
			}
			const apiUrl = merged.apiUrl || DEFAULT_API_URL
			const resolveStandaloneUser = createStandaloneUserResolver(
				{ apiUrl, clientId: standaloneClientId },
				{ user, getUser },
			)
			const ctx = createStandaloneContext(
				standaloneClientId,
				apiUrl,
				standaloneLogger,
				() => {
					;(resolveUserDelegate ?? resolveStandaloneUser)()
				},
				standaloneEnvironment,
			)
			phase = 'running'
			startedAs = 'standalone'
			startWithContext(ctx)
		},
		stop() {
			if (phase !== 'running') return
			phase = 'stopped'
			startedAs = null
			const store = currentStore
			const ctx = currentCtx
			currentStore = null
			currentCtx = null
			// No store: this run was sampled out (or never got past the gate);
			// nothing to flush or finalise.
			if (!store || !ctx) return
			if (store.stopped) return
			// Flush + finalise BEFORE flipping `stopped`: finalise's internal
			// flush is gated on !stopped, and queued uploads are gated on
			// !cancelled, so this ordering lets the recording's tail drain
			// instead of being dropped (onDestroy, by contrast, abandons).
			finalise(store, ctx, { useBeacon: false })
			store.stopped = true
			stopRrweb(store)
			removeListeners(store)
		},
	}
	return instance
}

// Returns the live session-replay handle for a given plugin context, or
// null if the session was bot-dropped, sample-skipped, or not yet
// created. Other plugins (e.g. user-test) can call this to attach the
// replay FK + offset to their own server-side records.
export function getCurrentSession(ctx: PluginContext): CurrentSessionHandle | null {
	// Same fallback as onFeedbackSubmit: a ctx without its own store (widget
	// mounted while a standalone recording was live) still resolves the
	// page-wide live session.
	const store = ctx.getStore<ReplayStore>() ?? readGlobalSlot()?.store
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
	scheduleChunkUpload,
	maybeIsolateSnapshot,
	startUrlChangeTracking,
	stopUrlChangeTracking,
	URL_CHANGE_TAG,
	RRWEB_EVENT_TYPE_FULL_SNAPSHOT,
	SNAPSHOT_ISOLATION_MIN_GAP_MS,
	HARD_CHUNK_BYTE_CAP,
	SDK_SESSION_STORAGE_KEY,
	MAX_PENDING_UPLOADS,
	UPLOAD_DROP_WARN_INTERVAL_MS,
	DEFAULTS,
	readGlobalSlot,
	captureSnapshotEvents,
	uploadSnapshotSession,
	postFinalise,
	RRWEB_EVENT_TYPE_META,
	SNAPSHOT_ATTACH_BUDGET_MS,
	SNAPSHOT_CAPTURE_BUDGET_MS,
	// rrweb needs a real DOM, so the node suite swaps in a fake recorder to
	// exercise the snapshot path. Pass null to restore the real loader.
	setRrwebLoader: (fn: (() => Promise<RrwebRecord | null>) | null): void => {
		rrwebLoaderOverride = fn
	},
}
