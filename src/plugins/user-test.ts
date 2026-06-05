// User-testing-mode plugin for the Usero widget.
//
// Activates ONLY when the host page URL carries `?usero_test=<slug>`. When
// active, it:
//   1. Creates a UserTestSession on the SaaS side via
//      POST /api/user-test-sessions
//   2. Starts a MediaRecorder on the user's microphone (Opus in WebM) and
//      ships chunks every `chunkSeconds` to
//      PUT /api/user-test-sessions/:id/chunk?index=N
//   3. Renders a small floating "recording" indicator with a Finish button
//      bottom-center so the tester can stop on their own.
//   4. On Finish, flushes any buffered chunks and calls
//      POST /api/user-test-sessions/:id/finalise.
//
// Resume across hard navigations: `pagehide` / `visibilitychange -> hidden` now
// PAUSE rather than finalise. The recorder stops and queued chunks drain on
// `keepalive`, but the session stays open server-side. Resume state
// ({ slug, sessionId, nextChunkIndex, startedAt }) is persisted per-origin in
// localStorage (`usero:user-test:active-session`). On init, a non-stale entry
// (< 2h old) makes the plugin re-adopt that session and continue recording from
// nextChunkIndex, even when the URL no longer carries `?usero_test`/`uts` (e.g.
// after an OAuth round-trip). The mic permission is already granted on the same
// origin, so no second prompt. The rrweb DOM recorder resumes on its own: the
// session-replay plugin re-inits on the fresh document, reuses the same
// sdkSessionId from sessionStorage, and the server stitches the replay across
// the gap. Finalisation comes only from an explicit Finish or the server-side
// stale-session sweep (~10 min of no chunks); see recoverStuckUserTestSessions
// in the feedback repo.
//
// Mic-permission denied is non-fatal: the session is still created (the
// session-replay plugin keeps recording in parallel) and the indicator
// shows a "no audio" hint. The SaaS side detects audio presence from the
// first chunk; if no chunks land, hasAudio stays false there too.
//
// Bundle hygiene: this module is a subpath export and does NOT depend on
// rrweb or any other heavy dep — just the native MediaRecorder API. The
// floating UI is shadow-DOM scoped so host page CSS can't leak in.
//
// Privacy: only the microphone is recorded. We never read DOM text, never
// touch the camera, and never persist audio in the browser past the
// IndexedDB fallback (cleared on successful upload).

import type { UseroPlugin, PluginContext } from '../plugin'
import { DEFAULT_API_URL } from '../types'

export interface UserTestOptions {
	// URL query param the welcome page appends to redirect testers back.
	// Default `usero_test`. Match SaaS side if you ever change it.
	queryParam?: string
	// Audio chunk length in seconds. Smaller = more partial-data resilience
	// but more requests. Default 10.
	chunkSeconds?: number
	// API origin. Override for self-hosted or local dev. Defaults to the
	// shared SDK constant (https://usero.io).
	apiUrl?: string
	// Override the tester-name shown on the SaaS side. Normally the welcome
	// page collects this and stores it in localStorage; the plugin reads it
	// from there. This option lets a host site bypass that.
	testerName?: string
	// Hide the floating indicator. The plugin still records and finalises
	// on `pagehide`, but the tester gets no on-page UI. Useful if the host
	// page wants to render its own.
	hideIndicator?: boolean
}

interface UserTestTask {
	id: string
	prompt: string
	sortOrder: number
}

interface MutedSegment {
	startMs: number
	endMs: number
}

interface InFlightNote {
	atMs: number
	text: string
	acked: boolean
	serverId?: string
}

interface RecorderStore {
	cancelled: boolean
	slug: string
	sessionId: string | null
	clientId: string | null
	recorder: MediaRecorder | null
	stream: MediaStream | null
	chunkIndex: number
	uploadQueue: Promise<void>
	pendingUploads: number
	startedAt: number
	indicator: HTMLElement | null
	indicatorRoot: ShadowRoot | null
	indicatorState: 'recording' | 'finishing' | 'done' | 'no-audio' | 'error'
	pageHideHandler: (() => void) | null
	visibilityHandler: (() => void) | null
	options: Required<UserTestOptions>
	tasks: UserTestTask[]
	tasksPanelOpen: boolean
	outsidePointerHandler: ((event: PointerEvent) => void) | null
	keydownHandler: ((event: KeyboardEvent) => void) | null
	// Mic mute
	hasMicPermission: boolean
	// True while getUserMedia is in flight (pending). Distinguishes the
	// "connecting" chip state (granted users, promise not yet resolved) from
	// the genuinely-failed terminal "none" state. Init true; cleared on every
	// success/failure exit of startRecording.
	micAcquiring: boolean
	// Why mic acquisition failed, for actionable terminal copy. 'blocked' =
	// permission denied (NotAllowedError), 'not-found' = no device
	// (NotFoundError), 'unsupported' = MediaRecorder/getUserMedia missing or
	// constructor threw. Null while acquiring or once granted.
	micFailReason: 'blocked' | 'not-found' | 'unsupported' | null
	muted: boolean
	mutedSinceMs: number | null
	mutedSegments: MutedSegment[]
	// Silent-mic guard. micSilent is true while the live input is reading
	// digital silence (dead mic, or a virtual audio device delivering nothing).
	// Non-blocking: recording continues; the pill just warns. Auto-clears when
	// real audio returns. silenceMonitor holds the AnalyserNode teardown.
	micSilent: boolean
	silenceMonitor: { stop(): void } | null
	muteToastShown: boolean
	muteToastTimers: number[]
	// Timers for the "Recording resumed" confirmation pill (shown once after a
	// resume across a hard navigation). Tracked so onDestroy can clear them.
	resumeToastTimers: number[]
	// In-flight notes
	notes: InFlightNote[]
	notesPopoverOpen: boolean
	notePopoverAtMs: number | null
	// End-of-test comment (collected on thanks screen)
	endNote: string
	// Re-entry guard for finishFlow.
	finishFlowRan: boolean
	// True when this store was rehydrated from persisted localStorage state
	// (a resume across a hard navigation) rather than a fresh start. Lets the
	// init path skip session creation/adoption and continue the chunk index.
	resumed: boolean
	// The per-tab sdkSessionId for this session, resolved once at session start
	// from the core (ctx.getSdkSessionId). Mirrored into the localStorage resume
	// state so a hard nav can re-seat it and keep the replay link intact, and
	// sent on every finalise so the (clientId, sdkSessionId) join resolves even
	// after resume. Null when replay is not active / the host predates the core
	// accessor.
	sdkSessionId: string | null
	// Offset (ms) into the session-replay recording at the moment THIS
	// user-test session started. Captured once at start (not at finalise)
	// so it pins the test timeline to the recording timeline. Null when no
	// replay is active (plugin not loaded, sampled out, or host predates
	// the core accessor); finalise then omits replayOffsetMs.
	replayOffsetAtStartMs: number | null
}

const DEFAULT_OPTIONS: Required<Omit<UserTestOptions, 'testerName' | 'apiUrl'>> & {
	testerName: string
	apiUrl: string
} = {
	queryParam: 'usero_test',
	// 10s (not 30) so at most ~10s of audio is at risk if the tab is torn
	// down before a flush, and so a session shorter than the old 30s window
	// still emits at least one chunk (previously its single buffered chunk was
	// never flushed and its audio was lost). Tradeoff: ~3x the R2 writes /
	// upload requests per session; 10s is an acceptable balance, don't go lower.
	chunkSeconds: 10,
	apiUrl: DEFAULT_API_URL,
	testerName: '',
	hideIndicator: false,
}

const TESTER_NAME_STORAGE_KEY = 'usero:user-test:tester-name'
const TASKS_PANEL_OPEN_STORAGE_KEY = 'usero:user-test:tasks-panel-open'
// Per-origin resume state. A single active user-test session per origin: the
// participant can only be inside one test at a time, so we don't key by slug.
// localStorage (not sessionStorage) so the entry survives a hard cross-origin
// navigation away-and-back (e.g. an OAuth round-trip) within the same tab.
const ACTIVE_SESSION_STORAGE_KEY = 'usero:user-test:active-session'
// A persisted active session older than this is treated as stale and ignored on
// init, so a long-abandoned entry can never silently start recording on an
// unrelated later visit. Matches the spirit of the server-side stale sweep.
const ACTIVE_SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000 // 2h
const IDB_NAME = 'usero-user-test'
const IDB_STORE = 'pending-chunks'

// Persisted resume state. Written when recording starts and updated as the
// chunk index advances; read on init to resume across a hard navigation.
//   - `status`: 'active' while recording, 'paused' once the page hid mid-test.
//     Both resume the same way; the flag is informational (and lets a future
//     UI distinguish "came back from a pause" if it wants to).
//   - `nextChunkIndex`: the chunk index the resumed recorder continues from.
//     The server stitches chunks, and the container remux tolerates the extra
//     WebM header the fresh post-resume recorder emits.
interface ActiveSessionState {
	slug: string
	sessionId: string
	nextChunkIndex: number
	startedAt: number
	status: 'active' | 'paused'
	// The per-tab sdkSessionId at the time recording started. Durably mirrored
	// here (localStorage survives a cross-origin hard nav; sessionStorage does
	// not) so the post-nav document can re-seat the SAME id and the resumed
	// SessionReplay row stays joined to this audio session via the server's
	// (clientId, sdkSessionId) match. Optional: absent when replay was not active
	// (nothing to keep linked), or when an older SDK wrote the entry.
	sdkSessionId?: string
}

function parseActiveSession(raw: unknown): ActiveSessionState | null {
	if (typeof raw !== 'object' || raw === null) return null
	const s = raw as {
		slug?: unknown
		sessionId?: unknown
		nextChunkIndex?: unknown
		startedAt?: unknown
		status?: unknown
		sdkSessionId?: unknown
	}
	if (typeof s.slug !== 'string' || !s.slug) return null
	if (typeof s.sessionId !== 'string' || !s.sessionId) return null
	if (typeof s.nextChunkIndex !== 'number' || !Number.isInteger(s.nextChunkIndex) || s.nextChunkIndex < 0) return null
	if (typeof s.startedAt !== 'number' || !Number.isFinite(s.startedAt)) return null
	const status = s.status === 'paused' ? 'paused' : 'active'
	const result: ActiveSessionState = {
		slug: s.slug,
		sessionId: s.sessionId,
		nextChunkIndex: s.nextChunkIndex,
		startedAt: s.startedAt,
		status,
	}
	// Loose sanity filter, same shape the core uses for the id. A bad value is
	// dropped (resume still works for audio, only the replay link is at risk).
	if (typeof s.sdkSessionId === 'string' && /^[a-z0-9-]{8,}$/i.test(s.sdkSessionId)) {
		result.sdkSessionId = s.sdkSessionId
	}
	return result
}

// Read the persisted active session for this origin, or null when absent,
// unparseable, or stale (> ACTIVE_SESSION_MAX_AGE_MS). Storage access is wrapped
// because localStorage can throw in sandboxed iframes / lockdown modes; a throw
// must never break the plugin (we just don't resume).
function readActiveSession(): ActiveSessionState | null {
	try {
		const raw = window.localStorage?.getItem(ACTIVE_SESSION_STORAGE_KEY)
		if (!raw) return null
		const parsed = parseActiveSession(JSON.parse(raw))
		if (!parsed) return null
		if (Date.now() - parsed.startedAt > ACTIVE_SESSION_MAX_AGE_MS) {
			clearActiveSession()
			return null
		}
		return parsed
	} catch {
		return null
	}
}

function writeActiveSession(state: ActiveSessionState): void {
	try {
		window.localStorage?.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(state))
	} catch {
		// Storage full / blocked: resume resilience is lost but recording continues.
	}
}

function clearActiveSession(): void {
	try {
		window.localStorage?.removeItem(ACTIVE_SESSION_STORAGE_KEY)
	} catch {
		// ignore
	}
}

// Persist the current store as the active resume state. Called when recording
// starts and after the chunk index advances. No-op until the session id exists.
function persistActiveSession(store: RecorderStore, status: 'active' | 'paused'): void {
	if (!store.sessionId) return
	const state: ActiveSessionState = {
		slug: store.slug,
		sessionId: store.sessionId,
		nextChunkIndex: store.chunkIndex,
		startedAt: store.startedAt,
		status,
	}
	if (store.sdkSessionId) state.sdkSessionId = store.sdkSessionId
	writeActiveSession(state)
}

interface PendingChunk {
	id: string
	sessionId: string
	apiUrl: string
	chunkIndex: number
	blob: Blob
	createdAt: number
}

function readTesterName(override: string): string | undefined {
	if (override) return override
	try {
		const stored = window.localStorage?.getItem(TESTER_NAME_STORAGE_KEY)
		if (stored && stored.trim()) return stored.trim().slice(0, 120)
	} catch {
		// Storage access can throw in some sandboxed iframes — ignore.
	}
	return undefined
}

// Read the `uts` (user-test session) id the entry screen appends when it
// creates the session server-side. When present, the SDK ADOPTS that session
// instead of minting its own (so the session has the participant's email from
// creation, no double-session). Absent for open tests using the old link
// shape, where the SDK falls back to createSession.
function getAdoptSessionId(): string | null {
	if (typeof window === 'undefined' || typeof window.location === 'undefined') return null
	try {
		const params = new URLSearchParams(window.location.search)
		const raw = params.get('uts')
		if (!raw) return null
		const cleaned = raw.trim().slice(0, 64)
		// Session ids are cuids: lowercase alphanumerics. Reject anything else.
		if (!/^[a-z0-9]+$/i.test(cleaned)) return null
		return cleaned
	} catch {
		return null
	}
}

function getTestSlug(queryParam: string): string | null {
	if (typeof window === 'undefined' || typeof window.location === 'undefined') return null
	try {
		const params = new URLSearchParams(window.location.search)
		const slug = params.get(queryParam)
		if (!slug) return null
		const cleaned = slug.trim().slice(0, 64)
		if (!/^[a-z0-9-]+$/i.test(cleaned)) return null
		return cleaned
	} catch {
		return null
	}
}

function isMediaRecorderSupported(): boolean {
	return typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

function pickMimeType(): string | undefined {
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

interface IndicatorCallbacks {
	onFinish: () => void
	onToggleTasks: () => void
	onToggleMute: () => void
	onOpenNote: () => void
}

function buildIndicator(host: HTMLElement, store: RecorderStore, callbacks: IndicatorCallbacks): ShadowRoot {
	const root = host.attachShadow({ mode: 'closed' })
	const style = document.createElement('style')
	// Compact, glassy dark pill. Mic chip is now a real button with three
	// states (recording / muted / no-mic). Notes button sits beside it.
	style.textContent = `
		:host { all: initial; }
		.anchor {
			position: fixed;
			bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
			left: 50%; transform: translateX(-50%);
			display: flex; flex-direction: column; align-items: center; gap: 8px;
			z-index: 2147483646; max-width: calc(100vw - 32px);
			font: 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
			color: #fff;
		}
		.bar {
			display: inline-flex; align-items: center; gap: 6px;
			padding: 6px 8px 6px 6px;
			background: rgba(17,17,17,0.82);
			border: 1px solid rgba(255,255,255,0.08);
			border-radius: 999px;
			box-shadow: 0 8px 24px rgba(0,0,0,0.22);
			backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
			max-width: 100%;
		}
		.panel {
			background: rgba(17,17,17,0.92);
			border: 1px solid rgba(255,255,255,0.08);
			border-radius: 14px; padding: 12px 14px 12px 8px;
			line-height: 1.45;
			box-shadow: 0 12px 32px rgba(0,0,0,0.32);
			max-height: min(60vh, 480px);
			max-width: min(420px, calc(100vw - 32px));
			width: max-content; overflow-y: auto;
		}
		.panel[hidden] { display: none; }
		.panel ol { margin: 0; padding-left: 26px; }
		.panel li { margin: 0 0 8px; }
		.panel li:last-child { margin: 0; }

		/* Mic chip: pill-within-pill with dot + label, doubles as mute toggle. */
		.mic {
			display: inline-flex; align-items: center; gap: 7px;
			min-height: 32px; min-width: 44px;
			padding: 0 11px 0 10px;
			border-radius: 999px;
			background: rgba(255,255,255,0.06);
			border: 1px solid rgba(255,255,255,0.06);
			color: #fff; font: inherit;
			cursor: pointer; appearance: none;
			transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
		}
		.mic:hover { background: rgba(255,255,255,0.12); }
		.mic:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
		.mic[data-mic-state="muted"] {
			background: rgba(251, 191, 36, 0.18);
			border-color: rgba(251, 191, 36, 0.45);
			color: #fcd34d;
		}
		.mic[data-mic-state="muted"]:hover { background: rgba(251, 191, 36, 0.26); }
		/* Connecting: getUserMedia pending. Steady amber tint reads as "working",
		   distinct from the live red pulse and the failed state below. The icon
		   gets a gentle non-pulsing breathe so it feels alive without alarming. */
		.mic[data-mic-state="connecting"] {
			background: rgba(251, 191, 36, 0.14);
			border-color: rgba(251, 191, 36, 0.32);
			color: #fcd34d;
			cursor: default;
		}
		.mic[data-mic-state="connecting"]:hover { background: rgba(251, 191, 36, 0.14); }
		.mic[data-mic-state="connecting"] .mic-icon {
			color: #fbbf24;
			animation: micBreathe 1.4s ease-in-out infinite;
		}
		/* Failed terminal state, actionable. Tappable affordance: clearer border,
		   pointer cursor, brightens on hover/focus to invite the retry tap. */
		.mic[data-mic-state="none"] {
			background: rgba(255,255,255,0.05);
			border-color: rgba(255,255,255,0.14);
			color: rgba(255,255,255,0.72);
			cursor: pointer;
		}
		.mic[data-mic-state="none"]:hover {
			background: rgba(255,255,255,0.12);
			border-color: rgba(255,255,255,0.24);
			color: #fff;
		}
		@keyframes micBreathe {
			0%, 100% { opacity: 0.55; }
			50% { opacity: 1; }
		}
		.mic-icon { width: 13px; height: 13px; display: inline-block; flex-shrink: 0; }
		.mic-label { font-weight: 500; letter-spacing: 0.01em; white-space: nowrap; }

		.dot {
			width: 7px; height: 7px; border-radius: 50%;
			background: #ef4444;
			box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6);
			animation: pulse 1.6s ease-out infinite;
			flex-shrink: 0;
		}
		.dot[data-state="no-audio"] { background: #fbbf24; animation: none; }
		.dot[data-state="finishing"] { background: #fbbf24; animation: none; }
		.dot[data-state="done"] { background: #10b981; animation: none; }
		.dot[data-state="error"] { background: #ef4444; animation: none; }

		.btn {
			appearance: none; border: 0; background: rgba(255,255,255,0.10);
			color: #fff; font: inherit; font-weight: 600;
			padding: 6px 12px; min-height: 32px; border-radius: 999px; cursor: pointer;
			transition: background 0.15s ease, transform 0.06s ease;
			display: inline-flex; align-items: center; gap: 6px;
		}
		.btn:hover { background: rgba(255,255,255,0.20); }
		.btn:active { transform: scale(0.97); }
		.btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
		.btn[disabled] { opacity: 0.5; cursor: progress; }
		.tasks-btn[aria-expanded="true"] { background: rgba(255,255,255,0.24); }

		/* Note button: icon-only, matches mic chip footprint */
		.note-btn {
			width: 32px; min-height: 32px; padding: 0;
			background: rgba(255,255,255,0.06);
			border: 1px solid rgba(255,255,255,0.06);
			border-radius: 999px;
			display: inline-flex; align-items: center; justify-content: center; gap: 4px;
			color: #fff; font: inherit; cursor: pointer; appearance: none;
			transition: background 0.15s ease, border-color 0.15s ease, width 0.18s ease;
			overflow: hidden;
		}
		.note-btn:hover { background: rgba(255,255,255,0.14); }
		.note-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
		.note-btn[data-has-notes="true"] { width: auto; padding: 0 10px 0 9px; gap: 6px; }
		.note-btn[aria-expanded="true"] { background: rgba(255,255,255,0.22); border-color: rgba(255,255,255,0.18); }
		.note-icon { width: 14px; height: 14px; display: inline-block; }
		.note-count { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }

		.spacer { width: 1px; height: 18px; background: rgba(255,255,255,0.14); margin: 0 1px; }

		@media (max-width: 480px) {
			.bar { gap: 4px; padding: 5px 6px 5px 5px; }
			.btn { padding: 7px 12px; min-height: 38px; }
			.mic, .note-btn { min-height: 38px; }
			.note-btn { width: 38px; }
			.note-btn[data-has-notes="true"] { width: auto; }
		}

		/* First-mute helper toast: sits above the pill, auto-dismisses */
		.toast {
			background: rgba(17,17,17,0.92);
			border: 1px solid rgba(251, 191, 36, 0.45);
			color: #fff;
			padding: 9px 14px; border-radius: 12px;
			max-width: min(340px, calc(100vw - 32px));
			box-shadow: 0 12px 28px rgba(0,0,0,0.28);
			text-align: center; line-height: 1.4;
			animation: toast-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
		}
		.toast[data-leaving="true"] { animation: toast-out 0.24s ease forwards; }
		.toast strong { color: #fcd34d; font-weight: 600; }
		@keyframes toast-in {
			from { opacity: 0; transform: translateY(6px); }
			to   { opacity: 1; transform: translateY(0); }
		}
		@keyframes toast-out {
			to { opacity: 0; transform: translateY(4px); }
		}

		/* "Recording resumed" confirmation: same pill footprint as the mute toast,
		   but carries the live-record red accent (not the amber warning treatment)
		   so it reads as reassurance, not a problem. Compact, inline, auto-dismisses.
		   Leads with the same pulsing record dot used on the bar's mic chip. */
		.resume-toast {
			display: inline-flex; align-items: center; gap: 8px;
			background: rgba(17,17,17,0.92);
			border: 1px solid rgba(239, 68, 68, 0.42);
			color: #fff; font-weight: 500; letter-spacing: 0.01em;
			padding: 8px 13px; border-radius: 999px;
			box-shadow: 0 12px 28px rgba(0,0,0,0.28);
			white-space: nowrap;
			animation: toast-in 0.22s cubic-bezier(0.2, 0.8, 0.2, 1);
		}
		.resume-toast[data-leaving="true"] { animation: toast-out 0.24s ease forwards; }
		.resume-toast .dot {
			width: 7px; height: 7px; border-radius: 50%;
			background: #ef4444; flex-shrink: 0;
			box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6);
			animation: pulse 1.6s ease-out infinite;
		}

		/* Notes popover */
		.note-popover {
			background: rgba(17,17,17,0.94);
			border: 1px solid rgba(255,255,255,0.10);
			border-radius: 14px; padding: 12px;
			width: min(340px, calc(100vw - 32px));
			box-shadow: 0 18px 40px rgba(0,0,0,0.36);
			display: flex; flex-direction: column; gap: 10px;
			animation: pop-in 0.18s cubic-bezier(0.2, 0.8, 0.2, 1);
		}
		.note-popover[hidden] { display: none; }
		@keyframes pop-in {
			from { opacity: 0; transform: translateY(6px) scale(0.98); }
			to   { opacity: 1; transform: translateY(0) scale(1); }
		}
		.note-head {
			color: rgba(255,255,255,0.7); font-size: 12px;
			font-weight: 500; letter-spacing: 0.02em;
		}
		.note-textarea {
			width: 100%; box-sizing: border-box;
			min-height: 80px; resize: vertical;
			padding: 10px 11px;
			background: rgba(0,0,0,0.35);
			border: 1px solid rgba(255,255,255,0.10);
			border-radius: 10px;
			color: #fff; font: inherit; font-size: 13.5px;
			line-height: 1.45;
			transition: border-color 0.15s ease;
		}
		.note-textarea:focus { outline: none; border-color: rgba(255,255,255,0.32); }
		.note-textarea::placeholder { color: rgba(255,255,255,0.42); }
		.note-actions {
			display: flex; align-items: center; justify-content: space-between; gap: 8px;
		}
		.note-actions .hint {
			color: rgba(255,255,255,0.45); font-size: 11px;
		}
		.note-actions .group { display: inline-flex; gap: 6px; }
		.note-actions .btn { padding: 6px 12px; font-size: 12.5px; min-height: 32px; }
		.btn-primary { background: #fff !important; color: #111; }
		.btn-primary:hover { background: rgba(255,255,255,0.85) !important; }
		.btn-ghost { background: transparent; color: rgba(255,255,255,0.7); }
		.btn-ghost:hover { background: rgba(255,255,255,0.10); color: #fff; }

		/* ---- Finished screen (complete + ended-early). Usero warm-stone palette,
		   shadow-DOM scoped so host CSS can't leak in. Scrollable so the primary
		   action stays reachable on a short phone with the keyboard open. ---- */
		.thanks {
			position: fixed; inset: 0;
			display: flex; align-items: flex-start; justify-content: center;
			background: rgba(28, 25, 23, 0.62);
			backdrop-filter: blur(8px);
			-webkit-backdrop-filter: blur(8px);
			color: #1c1917;
			font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
			z-index: 2147483647;
			padding: 24px 16px calc(env(safe-area-inset-bottom, 0px) + 24px);
			overflow-y: auto;
			-webkit-overflow-scrolling: touch;
		}
		.thanks-card {
			background: #fff; color: #1c1917;
			border-radius: 22px; padding: 30px 24px 24px;
			max-width: 400px; width: 100%;
			margin: auto 0;
			box-shadow: 0 24px 60px rgba(28, 25, 23, 0.28), 0 2px 8px rgba(28, 25, 23, 0.12);
			text-align: left;
			animation: thanks-in 0.34s cubic-bezier(0.16, 1, 0.3, 1);
		}
		@keyframes thanks-in {
			from { opacity: 0; transform: translateY(14px) scale(0.985); }
			to   { opacity: 1; transform: translateY(0) scale(1); }
		}
		.thanks-card .head { text-align: center; }
		.thanks h2 {
			margin: 0 0 7px; font-size: 22px; line-height: 1.2;
			font-weight: 600; letter-spacing: -0.018em; color: #1c1917;
		}
		.thanks .lede {
			margin: 0 auto 22px; font-size: 14.5px; line-height: 1.5;
			color: #57534e; text-align: center; max-width: 30ch;
		}

		/* Status medallion: green tick when complete, warm ring when ended early */
		.thanks .check {
			width: 56px; height: 56px; border-radius: 50%;
			display: grid; place-items: center;
			margin: 0 auto 16px;
		}
		.thanks .check.ok {
			background: #ecfdf5;
			box-shadow: inset 0 0 0 1px rgba(16,185,129,0.22);
			color: #059669;
		}
		.thanks .check.ok svg { width: 26px; height: 26px; }
		.thanks .check.early {
			background: #fff7ed;
			box-shadow: inset 0 0 0 1px rgba(234,88,12,0.20);
			color: #ea580c;
		}
		.thanks .check.early svg { width: 24px; height: 24px; }

		/* Verified-checks list (complete) / progress list (ended early) */
		.thanks .checks {
			list-style: none; margin: 0 0 4px; padding: 0;
			border: 1px solid #f0eeec; border-radius: 14px;
			background: #fafaf9; overflow: hidden;
		}
		.thanks .checks li {
			display: flex; align-items: center; gap: 11px;
			padding: 12px 14px; font-size: 14px; color: #292524;
			border-top: 1px solid #f0eeec;
		}
		.thanks .checks li:first-child { border-top: 0; }
		.thanks .checks .ic {
			width: 20px; height: 20px; border-radius: 50%;
			display: grid; place-items: center; flex-shrink: 0;
		}
		.thanks .checks .ic.done { background: #d1fae5; color: #059669; }
		.thanks .checks .ic.todo { background: #f5f5f4; color: #a8a29e; box-shadow: inset 0 0 0 1px #e7e5e4; }
		.thanks .checks .ic svg { width: 12px; height: 12px; }
		.thanks .checks li.muted-row { color: #78716c; }

		/* Payout block (complete) */
		.thanks .payout { margin-top: 20px; }
		.thanks .payout-q {
			font-size: 12px; font-weight: 600; letter-spacing: 0.04em;
			text-transform: uppercase; color: #a8a29e;
			margin: 0 0 10px;
		}
		.thanks .pay-primary {
			width: 100%; box-sizing: border-box;
			appearance: none; border: 0; cursor: pointer;
			background: #ea580c; color: #fff;
			padding: 15px 18px; border-radius: 14px;
			font: inherit; font-weight: 600; font-size: 15.5px;
			line-height: 1.3; text-align: center;
			box-shadow: 0 6px 16px rgba(234, 88, 12, 0.28);
			transition: background 0.15s ease, transform 0.07s ease, box-shadow 0.15s ease;
		}
		.thanks .pay-primary:hover { background: #c2410c; }
		.thanks .pay-primary:active { transform: scale(0.985); }
		.thanks .pay-primary:focus-visible { outline: 2px solid #ea580c; outline-offset: 2px; }
		.thanks .pay-primary[disabled] { opacity: 0.6; cursor: progress; box-shadow: none; }
		.thanks .pay-primary .amt { font-variant-numeric: tabular-nums; }
		.thanks .pay-alt {
			display: block; width: 100%;
			margin-top: 12px; padding: 4px;
			background: none; border: 0; cursor: pointer;
			font: inherit; font-size: 13px; font-weight: 500;
			color: #78716c; text-align: center;
			text-decoration: underline; text-underline-offset: 2px;
			transition: color 0.15s ease;
		}
		.thanks .pay-alt:hover { color: #44403c; }
		.thanks .pay-alt:focus-visible { outline: 2px solid #ea580c; outline-offset: 2px; border-radius: 6px; }
		.thanks [hidden] { display: none !important; }

		/* Alternate-email expander */
		.thanks .pay-edit { margin-top: 14px; animation: pop-in 0.2s cubic-bezier(0.2,0.8,0.2,1); }
		.thanks .pay-edit[hidden] { display: none; }
		.thanks .pay-label {
			display: block; margin: 0 0 7px;
			font-size: 13px; font-weight: 500; color: #44403c;
		}
		.thanks .pay-input {
			width: 100%; box-sizing: border-box;
			padding: 12px 13px;
			background: #fff; border: 1px solid #e7e5e4; border-radius: 11px;
			font: inherit; font-size: 15px; color: #1c1917;
			transition: border-color 0.15s ease, box-shadow 0.15s ease;
		}
		.thanks .pay-input:focus {
			outline: none; border-color: #ea580c;
			box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.16);
		}
		.thanks .pay-input::placeholder { color: #a8a29e; }
		.thanks .pay-eta {
			margin: 14px 0 0; font-size: 12px; line-height: 1.45;
			color: #a8a29e; text-align: center;
		}

		/* Ended-early "what unlocks the reward" note */
		.thanks .early-note {
			display: flex; align-items: flex-start; gap: 10px;
			margin-top: 18px; padding: 13px 14px;
			background: #fff7ed; border: 1px solid #fed7aa; border-radius: 13px;
			font-size: 13.5px; line-height: 1.45; color: #9a3412;
		}
		.thanks .early-note svg { width: 17px; height: 17px; flex-shrink: 0; margin-top: 1px; color: #ea580c; }
		.thanks .early-actions { margin-top: 18px; display: flex; flex-direction: column; gap: 10px; }
		.thanks .resume-btn {
			width: 100%; box-sizing: border-box;
			appearance: none; border: 0; cursor: pointer;
			background: #ea580c; color: #fff;
			padding: 15px 18px; border-radius: 14px;
			font: inherit; font-weight: 600; font-size: 15.5px;
			box-shadow: 0 6px 16px rgba(234, 88, 12, 0.28);
			transition: background 0.15s ease, transform 0.07s ease;
		}
		.thanks .resume-btn:hover { background: #c2410c; }
		.thanks .resume-btn:active { transform: scale(0.985); }
		.thanks .resume-btn:focus-visible { outline: 2px solid #ea580c; outline-offset: 2px; }
		.thanks .exit-btn {
			width: 100%; box-sizing: border-box;
			appearance: none; border: 0; background: none; cursor: pointer;
			padding: 4px; font: inherit; font-size: 13px; line-height: 1.45;
			color: #78716c; text-align: center;
		}
		.thanks .exit-btn:hover { color: #44403c; }
		.thanks .exit-btn:focus-visible { outline: 2px solid #ea580c; outline-offset: 2px; border-radius: 6px; }

		/* End-of-test note (shown after payout is set, complete path only) */
		.thanks .note-section {
			margin-top: 22px; padding-top: 20px;
			border-top: 1px solid #f0eeec;
		}
		.thanks .end-label {
			display: block; margin: 0 0 8px;
			font-size: 13px; font-weight: 500; color: #44403c;
		}
		.thanks .end-textarea {
			width: 100%; box-sizing: border-box;
			min-height: 84px; resize: vertical;
			padding: 12px 13px;
			background: #fafaf9;
			border: 1px solid #e7e5e4;
			border-radius: 12px;
			font: inherit; font-size: 14.5px; line-height: 1.5;
			color: #1c1917;
			transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
		}
		.thanks .end-textarea:focus {
			outline: none; border-color: #ea580c; background: #fff;
			box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.14);
		}
		.thanks .end-textarea::placeholder { color: #a8a29e; }
		.thanks .end-actions {
			display: flex; gap: 10px; margin-top: 14px;
		}
		.thanks .end-actions button {
			flex: 1;
			appearance: none; border: 1px solid #e7e5e4;
			background: #fff; color: #44403c;
			padding: 12px 14px; border-radius: 12px;
			font: inherit; font-weight: 600; font-size: 14px;
			cursor: pointer;
			transition: background 0.15s ease, border-color 0.15s ease;
		}
		.thanks .end-actions button:hover { background: #fafaf9; border-color: #d6d3d1; }
		.thanks .end-actions button.primary {
			background: #1c1917; color: #fff; border-color: #1c1917; flex: 1.4;
		}
		.thanks .end-actions button.primary:hover { background: #292524; border-color: #292524; }
		.thanks .end-actions button:focus-visible { outline: 2px solid #ea580c; outline-offset: 2px; }
		.thanks .end-hint {
			margin: 11px 0 0; font-size: 11.5px; color: #a8a29e; text-align: center;
		}
		.thanks .end-sent {
			margin-top: 16px; text-align: center; color: #57534e; font-size: 13.5px; line-height: 1.45;
		}
		@media (prefers-reduced-motion: reduce) {
			.thanks-card, .thanks .pay-edit { animation: none; }
		}

		@keyframes pulse {
			0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.55); }
			70% { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
			100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
		}
		@media (prefers-reduced-motion: reduce) {
			.dot { animation: none; }
			.toast, .note-popover, .resume-toast { animation: none; }
			.resume-toast[data-leaving="true"] { opacity: 0; }
		}
	`
	const anchor = document.createElement('div')
	anchor.className = 'anchor'

	const panel = document.createElement('div')
	panel.className = 'panel'
	panel.hidden = true

	// Toast slot: helper messages render here above the bar.
	const toastSlot = document.createElement('div')
	toastSlot.className = 'toast-slot'

	// Notes popover slot: rendered above the bar when open.
	const notePopover = document.createElement('div')
	notePopover.className = 'note-popover'
	notePopover.hidden = true

	const bar = document.createElement('div')
	bar.className = 'bar'
	bar.setAttribute('role', 'status')
	bar.setAttribute('aria-live', 'polite')

	// Mic chip = real button. Three states driven by data-mic-state.
	const micBtn = document.createElement('button')
	micBtn.type = 'button'
	micBtn.className = 'mic'
	micBtn.setAttribute('data-mic-state', 'recording')
	micBtn.setAttribute('aria-pressed', 'false')
	micBtn.setAttribute('aria-label', 'Mute microphone')

	const dot = document.createElement('span')
	dot.className = 'dot'
	dot.setAttribute('data-state', store.indicatorState)

	const micIcon = document.createElement('span')
	micIcon.className = 'mic-icon'
	micIcon.innerHTML = MIC_ICON_SVG
	micIcon.setAttribute('aria-hidden', 'true')

	const micLabel = document.createElement('span')
	micLabel.className = 'mic-label'
	micLabel.textContent = 'Recording'

	micBtn.appendChild(dot)
	micBtn.appendChild(micIcon)
	micBtn.appendChild(micLabel)
	micBtn.addEventListener('click', callbacks.onToggleMute)
	bar.appendChild(micBtn)

	// Notes button: icon-only by default, grows to show count once notes exist.
	const noteBtn = document.createElement('button')
	noteBtn.type = 'button'
	noteBtn.className = 'note-btn'
	noteBtn.setAttribute('aria-label', 'Add a timestamped note')
	noteBtn.setAttribute('aria-expanded', 'false')
	noteBtn.setAttribute('data-has-notes', 'false')
	noteBtn.innerHTML = `<span class="note-icon" aria-hidden="true">${NOTE_ICON_SVG}</span><span class="note-count" hidden></span>`
	noteBtn.addEventListener('click', callbacks.onOpenNote)
	bar.appendChild(noteBtn)

	const spacer = document.createElement('span')
	spacer.className = 'spacer'
	bar.appendChild(spacer)

	const btn = document.createElement('button')
	btn.type = 'button'
	btn.className = 'btn finish-btn'
	btn.textContent = 'Finish'
	btn.addEventListener('click', callbacks.onFinish)
	bar.appendChild(btn)

	if (store.tasks.length > 0) installTasksToggle(bar, btn, store, callbacks.onToggleTasks)

	anchor.appendChild(panel)
	anchor.appendChild(toastSlot)
	anchor.appendChild(notePopover)
	anchor.appendChild(bar)

	root.appendChild(style)
	root.appendChild(anchor)
	return root
}

// Inline SVGs kept tiny. currentColor so they inherit the chip text color.
const MIC_ICON_SVG = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="13" height="13"><path d="M8 1.5a2 2 0 0 0-2 2v4a2 2 0 1 0 4 0v-4a2 2 0 0 0-2-2Z" fill="currentColor"/><path d="M4 7.5a4 4 0 0 0 8 0M8 11.5v3M5.5 14.5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`
const MIC_MUTED_ICON_SVG = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="13" height="13"><path d="M8 1.5a2 2 0 0 0-2 2v3.2L10 11V3.5a2 2 0 0 0-2-2Z" fill="currentColor"/><path d="M4 7.5a4 4 0 0 0 6.5 3.12M12 7.5a4 4 0 0 1-.3 1.5M8 11.5v3M5.5 14.5h5M2 2l12 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`
const NOTE_ICON_SVG = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14"><path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h7A1.5 1.5 0 0 1 13 3.5V10a1.5 1.5 0 0 1-1.5 1.5H7L4 14v-2.5h-.5A1.5 1.5 0 0 1 2 10V3.5A1.5 1.5 0 0 1 3.5 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
// Thanks-screen icons: bold tick (medallion + done rows) and a clock (ended early).
const TICK_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 12.5 10 17.5 19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const TICK_SM_SVG = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 8.5 6.5 11.5 12.5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const CLOCK_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8.4" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const SPARK_ICON_SVG = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 1.5 9.5 6.5 14.5 8 9.5 9.5 8 14.5 6.5 9.5 1.5 8 6.5 6.5Z" fill="currentColor"/></svg>`

function installTasksToggle(bar: HTMLElement, finishBtn: HTMLElement, store: RecorderStore, onToggleTasks: () => void): void {
	const tasksBtn = document.createElement('button')
	tasksBtn.type = 'button'
	tasksBtn.className = 'btn tasks-btn'
	tasksBtn.textContent = `Tasks (${store.tasks.length})`
	tasksBtn.setAttribute('aria-expanded', store.tasksPanelOpen ? 'true' : 'false')
	tasksBtn.addEventListener('click', onToggleTasks)
	bar.insertBefore(tasksBtn, finishBtn)
}

function renderTasksPanel(store: RecorderStore): void {
	const root = store.indicatorRoot
	if (!root) return
	const panel = root.querySelector('.panel')
	if (!(panel instanceof HTMLElement)) return
	// Build content once.
	if (!panel.firstChild && store.tasks.length > 0) {
		const ol = document.createElement('ol')
		for (const task of store.tasks) {
			const li = document.createElement('li')
			li.textContent = task.prompt
			ol.appendChild(li)
		}
		panel.appendChild(ol)
	}
	panel.hidden = !store.tasksPanelOpen
	const tasksBtn = root.querySelector('.tasks-btn')
	if (tasksBtn instanceof HTMLElement) {
		tasksBtn.setAttribute('aria-expanded', store.tasksPanelOpen ? 'true' : 'false')
	}
}

function readTasksPanelOpen(): boolean {
	try { return window.sessionStorage?.getItem(TASKS_PANEL_OPEN_STORAGE_KEY) === '1' } catch { return false }
}
function writeTasksPanelOpen(open: boolean): void {
	try { window.sessionStorage?.setItem(TASKS_PANEL_OPEN_STORAGE_KEY, open ? '1' : '0') } catch { /* ignore */ }
}

function micChipState(store: RecorderStore): 'recording' | 'muted' | 'none' | 'connecting' | 'silent' | 'inactive' {
	if (store.indicatorState === 'finishing' || store.indicatorState === 'done' || store.indicatorState === 'error') {
		return 'inactive'
	}
	if (!store.hasMicPermission) {
		// Pending getUserMedia: show "connecting" so granted users never flash
		// the failure copy. Once startRecording resolves or rejects it clears
		// micAcquiring, and we fall through to the terminal "none" state.
		if (store.micAcquiring) return 'connecting'
		return 'none'
	}
	if (store.muted) return 'muted'
	// Permission granted and not muted, but the live track is reading digital
	// silence (dead mic or a virtual silent input device). Warn, non-blocking:
	// recording continues, this just prompts the participant to check their mic.
	if (store.micSilent) return 'silent'
	return 'recording'
}

function renderIndicatorState(store: RecorderStore): void {
	const root = store.indicatorRoot
	if (!root) return
	const dot = root.querySelector('.dot')
	const mic = root.querySelector<HTMLButtonElement>('.mic')
	const micIcon = root.querySelector('.mic-icon')
	const micLabel = root.querySelector('.mic-label')
	const btn = root.querySelector<HTMLButtonElement>('.finish-btn')
	if (!(dot instanceof HTMLElement) || !mic || !(micIcon instanceof HTMLElement) || !(micLabel instanceof HTMLElement) || !btn) return

	dot.setAttribute('data-state', store.indicatorState)
	const chipState = micChipState(store)
	// The silent-mic warning reuses the existing "none" warning treatment
	// (muted-grey, tappable retry affordance) rather than inventing a new visual
	// — same as the "Mic blocked, tap to retry" failed state, just different copy.
	const micStateAttr = chipState === 'inactive' || chipState === 'silent' ? 'none' : chipState
	mic.setAttribute('data-mic-state', micStateAttr)
	// Distinguish "acquiring" (genuinely failed, actionable) from "connecting"
	// at the attribute level so the dot/visuals key off the right state. The
	// failed terminal chip is a retry affordance; mark it so CSS can style it.
	mic.removeAttribute('data-mic-fail')
	if (chipState === 'none') mic.setAttribute('data-mic-fail', store.micFailReason ?? 'blocked')

	// Finish-button copy is driven by the indicatorState (network / lifecycle).
	switch (store.indicatorState) {
		case 'recording':
		case 'no-audio':
			btn.textContent = 'Finish'
			btn.disabled = false
			break
		case 'finishing':
			btn.textContent = 'Saving'
			btn.disabled = true
			break
		case 'done':
			btn.textContent = 'Done'
			btn.disabled = true
			break
		case 'error':
			btn.textContent = 'Retry'
			btn.disabled = false
			break
	}

	// Mic chip copy + icon. Replay continues in all states; the chip only
	// describes the audio track.
	switch (chipState) {
		case 'recording':
			micIcon.innerHTML = MIC_ICON_SVG
			micLabel.textContent = 'Recording'
			mic.setAttribute('aria-label', 'Mute microphone')
			mic.setAttribute('aria-pressed', 'false')
			mic.removeAttribute('tabindex')
			break
		case 'muted':
			micIcon.innerHTML = MIC_MUTED_ICON_SVG
			micLabel.textContent = 'Muted'
			mic.setAttribute('aria-label', 'Unmute microphone')
			mic.setAttribute('aria-pressed', 'true')
			mic.removeAttribute('tabindex')
			break
		case 'connecting':
			// getUserMedia still pending. Granted users sit here briefly instead
			// of flashing the failure copy. Not yet a toggle, so unfocusable.
			micIcon.innerHTML = MIC_ICON_SVG
			micLabel.textContent = 'Connecting mic'
			mic.setAttribute('aria-label', 'Connecting microphone')
			mic.setAttribute('aria-pressed', 'false')
			mic.setAttribute('tabindex', '-1')
			break
		case 'silent':
			// Permission granted, recording live, but the input is digital
			// silence (dead mic or a virtual silent device). Warn, non-blocking:
			// recording continues. Tappable so the participant can re-acquire the
			// mic after switching their input device. Auto-clears when real audio
			// returns (the monitor flips store.micSilent back to false).
			micIcon.innerHTML = MIC_MUTED_ICON_SVG
			micLabel.textContent = "We can't hear you, tap to recheck"
			mic.setAttribute('aria-label', "We can't hear your microphone. Check your input device, then tap to recheck. Recording continues.")
			mic.setAttribute('aria-pressed', 'false')
			mic.removeAttribute('tabindex')
			break
		case 'none': {
			// Genuinely failed terminal state. Actionable: the chip is a button
			// that re-attempts mic acquisition. Keyboard-focusable (no tabindex
			// -1). Replay keeps recording regardless.
			micIcon.innerHTML = MIC_MUTED_ICON_SVG
			const failLabel =
				store.micFailReason === 'not-found' ? 'No mic found, tap to retry' :
				'Mic blocked, tap to retry'
			const failAria =
				store.micFailReason === 'not-found'
					? 'No microphone found, tap to retry. Replay continues.'
					: 'Microphone blocked, tap to retry. Replay continues.'
			micLabel.textContent = failLabel
			mic.setAttribute('aria-label', failAria)
			mic.setAttribute('aria-pressed', 'false')
			mic.removeAttribute('tabindex')
			break
		}
		case 'inactive':
			micIcon.innerHTML = MIC_ICON_SVG
			micLabel.textContent =
				store.indicatorState === 'finishing' ? 'Saving' :
				store.indicatorState === 'done' ? 'Saved' :
				'Save failed'
			mic.setAttribute('aria-label', 'Recording stopped')
			mic.setAttribute('aria-pressed', 'false')
			mic.setAttribute('tabindex', '-1')
			break
	}
}

function renderNotesCount(store: RecorderStore): void {
	const root = store.indicatorRoot
	if (!root) return
	const noteBtn = root.querySelector('.note-btn')
	const count = root.querySelector('.note-count')
	if (!(noteBtn instanceof HTMLElement) || !(count instanceof HTMLElement)) return
	const n = store.notes.length
	noteBtn.setAttribute('data-has-notes', n > 0 ? 'true' : 'false')
	if (n > 0) {
		count.textContent = String(n)
		count.hidden = false
		noteBtn.setAttribute('aria-label', `Add a timestamped note (${n} so far)`)
	} else {
		count.textContent = ''
		count.hidden = true
		noteBtn.setAttribute('aria-label', 'Add a timestamped note')
	}
}

function showMuteToast(store: RecorderStore): void {
	if (store.muteToastShown) return
	store.muteToastShown = true
	const root = store.indicatorRoot
	if (!root) return
	const slot = root.querySelector('.toast-slot')
	if (!(slot instanceof HTMLElement)) return
	slot.innerHTML = ''
	const toast = document.createElement('div')
	toast.className = 'toast'
	toast.setAttribute('role', 'status')
	toast.innerHTML = `<strong>Mic off.</strong> Screen is still recording. Tap to unmute.`
	slot.appendChild(toast)
	const outer = window.setTimeout(() => {
		if (!toast.isConnected) return
		toast.setAttribute('data-leaving', 'true')
		const inner = window.setTimeout(() => {
			if (toast.isConnected) toast.remove()
		}, 260)
		store.muteToastTimers.push(inner)
	}, 3000)
	store.muteToastTimers.push(outer)
}

// Brief, unobtrusive confirmation that recording picked back up after the
// participant returned from a hard navigation (e.g. an OAuth round-trip). It
// reuses the toast slot above the bar and the shared toast-in/out animations,
// but with the live-record red accent so it reassures rather than warns. Shows
// once, then auto-dismisses; clears store.resumed so a later render can't
// re-fire it. Reduced-motion is handled in CSS (no slide, instant fade).
function showResumedToast(store: RecorderStore): void {
	if (!store.resumed) return
	store.resumed = false
	const root = store.indicatorRoot
	if (!root) return
	const slot = root.querySelector('.toast-slot')
	if (!(slot instanceof HTMLElement)) return
	slot.innerHTML = ''
	const toast = document.createElement('div')
	toast.className = 'resume-toast'
	toast.setAttribute('role', 'status')
	const dot = document.createElement('span')
	dot.className = 'dot'
	dot.setAttribute('aria-hidden', 'true')
	const label = document.createElement('span')
	label.textContent = 'Recording resumed'
	toast.appendChild(dot)
	toast.appendChild(label)
	slot.appendChild(toast)
	const outer = window.setTimeout(() => {
		if (!toast.isConnected) return
		toast.setAttribute('data-leaving', 'true')
		const inner = window.setTimeout(() => {
			if (toast.isConnected) toast.remove()
		}, 260)
		store.resumeToastTimers.push(inner)
	}, 3200)
	store.resumeToastTimers.push(outer)
}

function openNotePopover(store: RecorderStore, onSave: (text: string) => void, onCancel: () => void): void {
	const root = store.indicatorRoot
	if (!root) return
	const pop = root.querySelector('.note-popover')
	const noteBtn = root.querySelector('.note-btn')
	if (!(pop instanceof HTMLElement) || !(noteBtn instanceof HTMLElement)) return

	store.notesPopoverOpen = true
	store.notePopoverAtMs = Date.now() - store.startedAt
	noteBtn.setAttribute('aria-expanded', 'true')

	pop.innerHTML = ''
	const head = document.createElement('div')
	head.className = 'note-head'
	head.innerHTML = `<span>Add a note</span>`

	const form = document.createElement('form')
	form.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin:0;'
	form.noValidate = true

	const ta = document.createElement('textarea')
	ta.className = 'note-textarea'
	ta.placeholder = 'What just happened? Confusing? Surprising? Broken?'
	ta.rows = 3
	ta.setAttribute('aria-label', 'Note text')

	const actions = document.createElement('div')
	actions.className = 'note-actions'
	const hint = document.createElement('span')
	hint.className = 'hint'
	hint.innerHTML = '<kbd style="font-family:inherit">Cmd</kbd>+Enter to save'
	const group = document.createElement('div')
	group.className = 'group'
	const cancelBtn = document.createElement('button')
	cancelBtn.type = 'button'
	cancelBtn.className = 'btn btn-ghost'
	cancelBtn.textContent = 'Cancel'
	const saveBtn = document.createElement('button')
	saveBtn.type = 'submit'
	saveBtn.className = 'btn btn-primary'
	saveBtn.textContent = 'Save'
	group.appendChild(cancelBtn)
	group.appendChild(saveBtn)
	actions.appendChild(hint)
	actions.appendChild(group)

	form.appendChild(ta)
	form.appendChild(actions)

	pop.appendChild(head)
	pop.appendChild(form)
	pop.hidden = false

	const submit = (): void => {
		const text = ta.value.trim()
		if (!text) { onCancel(); return }
		onSave(text)
	}
	form.addEventListener('submit', e => { e.preventDefault(); submit() })
	cancelBtn.addEventListener('click', () => onCancel())
	ta.addEventListener('keydown', e => {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault()
			submit()
		} else if (e.key === 'Escape') {
			e.preventDefault()
			onCancel()
		}
	})

	// Autofocus on next frame so animation can finish without scroll jank.
	window.requestAnimationFrame(() => { ta.focus({ preventScroll: true }) })
}

function closeNotePopover(store: RecorderStore): void {
	const root = store.indicatorRoot
	if (!root) return
	const pop = root.querySelector('.note-popover')
	const noteBtn = root.querySelector('.note-btn')
	if (pop instanceof HTMLElement) {
		pop.hidden = true
		pop.innerHTML = ''
	}
	if (noteBtn instanceof HTMLElement) noteBtn.setAttribute('aria-expanded', 'false')
	store.notesPopoverOpen = false
	store.notePopoverAtMs = null
}

// Escape user-controlled strings before they touch innerHTML. The payout email
// comes from our own DB, but it originated as participant input, so treat it as
// untrusted and never interpolate it raw into markup.
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
}

function isValidEmail(value: string): boolean {
	// Pragmatic check; the server re-validates with zod .email().
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

interface ThanksOptions {
	// Payment summary from the first finalise response. Null when the server is
	// older / didn't return it: we fall back to the neutral note-only screen.
	payment: PaymentSummary | null
	// Confirm the participant's payout destination. Resolves true on success.
	onPayout: (destination: string | null) => Promise<boolean>
	// End-of-test wrap-up note (complete path). Throws on failure so the UI can retry.
	onSubmitNote: (text: string) => Promise<void> | void
	onSkip: () => void
	// Re-arm recording and dismiss the overlay (ended-early path "Resume").
	onResume: () => void
}

function showThanksScreen(root: ShadowRoot, opts: ThanksOptions): void {
	const overlay = document.createElement('div')
	overlay.className = 'thanks'
	overlay.setAttribute('role', 'dialog')
	overlay.setAttribute('aria-modal', 'true')

	const card = document.createElement('div')
	card.className = 'thanks-card'
	overlay.appendChild(card)
	root.appendChild(overlay)

	// Ended-early branch: warmer, non-punishing, keep Resume primary.
	if (opts.payment && !opts.payment.qualified) {
		renderEndedEarly(card, opts)
		return
	}

	// Complete branch (also the fallback when payment is null: a clean "saved"
	// confirmation with the wrap-up note, no payout block since we have no data).
	renderComplete(card, opts)
}

// Builds the verified-checks list. `done` rows get the green tick; an unfinished
// tasks row (ended-early) gets the hollow todo dot.
function checksList(rows: Array<{ label: string; done: boolean; muted?: boolean }>): string {
	const items = rows
		.map(r => {
			const icClass = r.done ? 'ic done' : 'ic todo'
			const icon = r.done ? TICK_SM_SVG : ''
			const liClass = r.muted ? ' class="muted-row"' : ''
			return `<li${liClass}><span class="${icClass}" aria-hidden="true">${icon}</span><span>${escapeHtml(r.label)}</span></li>`
		})
		.join('')
	return `<ul class="checks">${items}</ul>`
}

function renderComplete(card: HTMLElement, opts: ThanksOptions): void {
	const payment = opts.payment
	const reward = payment?.reward ?? null
	const defaultEmail = payment?.payoutEmail ?? null
	const tasksTotal = payment?.tasksTotal ?? 0

	const head = document.createElement('div')
	head.className = 'head'
	const lede = reward
		? `We have your recording. Confirm where to send your ${escapeHtml(reward)} and the team will review it shortly.`
		: 'We have your recording. Thanks for taking the time to walk us through it.'
	head.innerHTML = `
		<div class="check ok" aria-hidden="true">${TICK_ICON_SVG}</div>
		<h2>You're done.</h2>
		<p class="lede">${lede}</p>
		${tasksTotal > 0
			? checksList([
					{ label: tasksTotal === 1 ? '1 task completed' : `All ${tasksTotal} tasks completed`, done: true },
					{ label: 'Voice recording captured', done: true },
					{ label: 'Screen replay uploaded', done: true },
				])
			: checksList([
					{ label: 'Voice recording captured', done: true },
					{ label: 'Screen replay uploaded', done: true },
				])}
	`
	card.appendChild(head)

	// If we have no payment data (older server) skip payout entirely and go
	// straight to the wrap-up note.
	if (!payment) {
		appendNoteSection(card, opts, 'Your session was saved. Anything you would add?')
		return
	}

	renderPayout(card, opts, reward, defaultEmail)
}

// Payout capture: one-tap default to the sign-up email, with a quieter expander
// to use a different email. Progressive disclosure (the default path is not a form).
function renderPayout(card: HTMLElement, opts: ThanksOptions, reward: string | null, defaultEmail: string | null): void {
	const wrap = document.createElement('div')
	wrap.className = 'payout'

	const rewardLabel = reward ?? 'my reward'
	const haveDefault = !!defaultEmail && isValidEmail(defaultEmail)

	wrap.innerHTML = `
		<p class="payout-q">Where should we send ${escapeHtml(reward ?? 'your reward')}?</p>
		<button type="button" class="pay-primary" ${haveDefault ? '' : 'hidden'}>
			Send <span class="amt">${escapeHtml(rewardLabel)}</span>${haveDefault ? ` to ${escapeHtml(defaultEmail as string)}` : ''}
		</button>
		<button type="button" class="pay-alt">${haveDefault ? 'Use a different email' : 'Add your payout email'}</button>
		<div class="pay-edit" ${haveDefault ? 'hidden' : ''}>
			<label class="pay-label" for="usero-payout-email">Payout email</label>
			<input id="usero-payout-email" class="pay-input" type="email" inputmode="email"
				autocomplete="email" placeholder="you@example.com" value="${haveDefault ? '' : escapeHtml(defaultEmail ?? '')}" />
		</div>
		<p class="pay-eta">Reward arrives within about 2 days of the team reviewing it.</p>
	`
	card.appendChild(wrap)

	const primary = wrap.querySelector<HTMLButtonElement>('.pay-primary')
	const altLink = wrap.querySelector<HTMLButtonElement>('.pay-alt')
	const editBox = wrap.querySelector<HTMLElement>('.pay-edit')
	const emailInput = wrap.querySelector<HTMLInputElement>('.pay-input')
	if (!primary || !altLink || !editBox || !emailInput) return

	const confirm = async (destination: string | null): Promise<void> => {
		primary.disabled = true
		altLink.style.pointerEvents = 'none'
		const ok = await opts.onPayout(destination)
		// Whatever the network outcome, the session is payable (server defaults to
		// the sign-up email). Move the participant forward rather than trapping them.
		wrap.remove()
		const confirmedTo = destination ?? defaultEmail
		const sentMsg = confirmedTo
			? `${reward ? `${reward} is` : "Your reward is"} set to go to ${confirmedTo}.`
			: 'Your reward is on its way.'
		const note = ok ? sentMsg : `${sentMsg} (We will retry sending the details.)`
		appendNoteSection(card, opts, `${note} Anything you would add before you go?`)
	}

	// One-tap default path.
	primary.addEventListener('click', () => { void confirm(null) })

	// Expander: reveal the email field, focus it, submit on Enter.
	const openEditor = (): void => {
		primary.hidden = true
		altLink.hidden = true
		editBox.hidden = false
		// Append a confirm button under the input on first open.
		if (!editBox.querySelector('.pay-confirm')) {
			const btn = document.createElement('button')
			btn.type = 'button'
			btn.className = 'pay-primary pay-confirm'
			btn.style.marginTop = '12px'
			btn.textContent = reward ? `Send ${reward} here` : 'Use this email'
			editBox.appendChild(btn)
			btn.addEventListener('click', () => void submitEmail())
		}
		window.requestAnimationFrame(() => emailInput.focus({ preventScroll: true }))
	}

	const submitEmail = async (): Promise<void> => {
		const value = emailInput.value.trim().toLowerCase()
		if (!isValidEmail(value)) {
			emailInput.focus()
			emailInput.style.borderColor = '#dc2626'
			return
		}
		await confirm(value)
	}

	altLink.addEventListener('click', openEditor)
	emailInput.addEventListener('input', () => { emailInput.style.borderColor = '' })
	emailInput.addEventListener('keydown', e => {
		if (e.key === 'Enter') { e.preventDefault(); void submitEmail() }
	})
}

function renderEndedEarly(card: HTMLElement, opts: ThanksOptions): void {
	const payment = opts.payment
	const done = payment?.tasksDone ?? 0
	const total = payment?.tasksTotal ?? 0
	const reward = payment?.reward ?? null

	const head = document.createElement('div')
	head.className = 'head'
	const lede = total > 0
		? `We saw ${done} of ${total} ${total === 1 ? 'task' : 'tasks'} finished. No worries, you can pick up right where you left off.`
		: 'It looks like the session ended before you finished. No worries, you can pick up where you left off.'
	head.innerHTML = `
		<div class="check early" aria-hidden="true">${CLOCK_ICON_SVG}</div>
		<h2>Looks like you stopped early</h2>
		<p class="lede">${lede}</p>
	`
	card.appendChild(head)

	// Per-task progress when we know the counts: done rows ticked, the rest hollow.
	if (total > 0) {
		const rows: Array<{ label: string; done: boolean }> = []
		for (let i = 0; i < total; i += 1) {
			rows.push({ label: `Task ${i + 1}`, done: i < done })
		}
		const list = document.createElement('div')
		list.innerHTML = checksList(rows)
		const ul = list.firstElementChild
		if (ul) card.appendChild(ul)
	}

	const note = document.createElement('div')
	note.className = 'early-note'
	note.innerHTML = `${SPARK_ICON_SVG}<span><strong style="font-weight:600">Resume the test.</strong> ${
		reward ? `Your ${escapeHtml(reward)} reward unlocks` : 'The reward unlocks'
	} once all ${total > 0 ? total : 'the'} ${total === 1 ? 'task is' : 'tasks are'} done.</span>`
	card.appendChild(note)

	const actions = document.createElement('div')
	actions.className = 'early-actions'
	const resume = document.createElement('button')
	resume.type = 'button'
	resume.className = 'resume-btn'
	resume.textContent = 'Resume where I left off'
	const exit = document.createElement('button')
	exit.type = 'button'
	exit.className = 'exit-btn'
	exit.textContent = "Thanks for trying. No reward this time since the tasks weren't finished."
	actions.appendChild(resume)
	actions.appendChild(exit)
	card.appendChild(actions)

	resume.addEventListener('click', () => {
		const overlay = card.closest('.thanks')
		if (overlay instanceof HTMLElement) overlay.remove()
		opts.onResume()
	})
	exit.addEventListener('click', () => {
		card.innerHTML = ''
		const sent = document.createElement('p')
		sent.className = 'end-sent'
		sent.textContent = 'Thanks for giving it a go. You can close this tab now.'
		card.appendChild(sent)
	})
}

// The wrap-up note section, shared by the complete path (after payout) and the
// older-server fallback. Mirrors the prior behaviour: Cmd/Ctrl+Enter to send,
// retry on failure, skip allowed.
function appendNoteSection(card: HTMLElement, opts: ThanksOptions, prompt: string): void {
	const section = document.createElement('div')
	section.className = 'note-section'

	const form = document.createElement('form')
	form.noValidate = true
	form.innerHTML = `
		<label class="end-label" for="usero-end-note">${escapeHtml(prompt)}</label>
		<textarea
			id="usero-end-note"
			class="end-textarea"
			rows="3"
			placeholder="Confusing bits, things you liked, what you'd change..."
		></textarea>
		<div class="end-actions">
			<button type="button" class="skip">Skip</button>
			<button type="submit" class="primary">Send feedback</button>
		</div>
		<p class="end-hint">Cmd or Ctrl plus Enter to send. Either button is fine.</p>
	`
	section.appendChild(form)
	card.appendChild(section)

	const ta = form.querySelector<HTMLTextAreaElement>('#usero-end-note')
	const skipBtn = form.querySelector<HTMLButtonElement>('button.skip')
	if (!ta || !skipBtn) return

	const swapToSent = (message: string): void => {
		section.remove()
		const sent = document.createElement('p')
		sent.className = 'end-sent'
		sent.textContent = message
		card.appendChild(sent)
	}

	const ERROR_CLASS = 'end-error'
	const showError = (message: string): void => {
		const prior = form.querySelector(`.${ERROR_CLASS}`)
		if (prior) prior.remove()
		const err = document.createElement('p')
		err.className = ERROR_CLASS
		err.textContent = message
		err.setAttribute('role', 'alert')
		err.style.cssText = 'margin:10px 0 0;font-size:12.5px;color:#b91c1c;text-align:center;'
		form.appendChild(err)
	}

	const submit = async (): Promise<void> => {
		const text = ta.value.trim()
		ta.disabled = true
		skipBtn.disabled = true
		const submitBtn = form.querySelector<HTMLButtonElement>('button.primary')
		if (submitBtn) submitBtn.disabled = true
		if (text) {
			try {
				await Promise.race([
					Promise.resolve(opts.onSubmitNote(text)),
					new Promise<never>((_, reject) => {
						window.setTimeout(() => reject(new Error('timeout')), 30000)
					}),
				])
				swapToSent('Thanks. You can close this tab.')
			} catch {
				ta.disabled = false
				skipBtn.disabled = false
				if (submitBtn) submitBtn.disabled = false
				showError("Couldn't save your note. Try again?")
			}
		} else {
			opts.onSkip()
			swapToSent('All set. You can close this tab.')
		}
	}

	form.addEventListener('submit', e => { e.preventDefault(); void submit() })
	skipBtn.addEventListener('click', () => { ta.value = ''; void submit() })
	ta.addEventListener('keydown', e => {
		if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
			e.preventDefault()
			void submit()
		}
	})

	window.requestAnimationFrame(() => { ta.focus({ preventScroll: true }) })
}

function parseTasks(raw: unknown): UserTestTask[] {
	if (!Array.isArray(raw)) return []
	const out = raw.flatMap((item: unknown): UserTestTask[] => {
		const t = item as { id?: unknown; prompt?: unknown; sortOrder?: unknown }
		if (!t || typeof t.id !== 'string' || typeof t.prompt !== 'string' || typeof t.sortOrder !== 'number') return []
		return [{ id: t.id, prompt: t.prompt, sortOrder: t.sortOrder }]
	})
	out.sort((a, b) => a.sortOrder - b.sortOrder)
	return out
}

async function createSession(
	apiUrl: string,
	slug: string,
	testerName: string | undefined,
): Promise<{ sessionId: string; clientId: string; tasks: UserTestTask[] } | null> {
	try {
		const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/user-test-sessions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slug, ...(testerName ? { testerName } : {}) }),
		})
		if (!res.ok) return null
		const json = (await res.json()) as { sessionId?: unknown; clientId?: unknown; tasks?: unknown }
		if (typeof json.sessionId !== 'string' || typeof json.clientId !== 'string') return null
		return { sessionId: json.sessionId, clientId: json.clientId, tasks: parseTasks(json.tasks) }
	} catch {
		return null
	}
}

// Adopt an existing session the entry screen already created (carried via the
// `uts` URL param). GET the clientId + tasks for it; we do NOT create a new
// session. Returns null on any failure so the caller can surface the error
// state (we deliberately do NOT silently fall back to createSession here: a
// present-but-unresolvable uts means something is wrong, and creating a second
// anonymous session is exactly the double-session bug we're avoiding).
async function adoptSession(
	apiUrl: string,
	sessionId: string,
): Promise<{ sessionId: string; clientId: string; tasks: UserTestTask[] } | null> {
	try {
		const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/user-test-sessions/${encodeURIComponent(sessionId)}/adopt`, {
			method: 'GET',
		})
		if (!res.ok) return null
		const json = (await res.json()) as { sessionId?: unknown; clientId?: unknown; tasks?: unknown }
		if (typeof json.sessionId !== 'string' || typeof json.clientId !== 'string') return null
		return { sessionId: json.sessionId, clientId: json.clientId, tasks: parseTasks(json.tasks) }
	} catch {
		return null
	}
}

interface FinaliseNote {
	atMs: number
	text: string
}

// Participant-facing payment summary the finalise endpoint returns on the FIRST
// call. Drives the finished screen: `qualified` picks the complete vs ended-early
// layout, `reward` is the formatted headline (e.g. "$15"), `payoutEmail` seeds the
// one-tap payout default, tasksDone/tasksTotal drive the ended-early missing line.
// Every field is optional so an older server (no `payment` block) degrades to the
// neutral "thanks, saved" screen rather than throwing.
interface PaymentSummary {
	qualified: boolean
	reward: string | null
	payoutEmail: string | null
	tasksDone: number
	tasksTotal: number
}

interface FinaliseResult {
	ok: boolean
	// Only present on the first finalise call (the server computes it once).
	payment: PaymentSummary | null
}

function parsePaymentSummary(raw: unknown): PaymentSummary | null {
	if (typeof raw !== 'object' || raw === null) return null
	const p = raw as {
		qualified?: unknown
		reward?: unknown
		payoutEmail?: unknown
		tasksDone?: unknown
		tasksTotal?: unknown
	}
	if (typeof p.qualified !== 'boolean') return null
	return {
		qualified: p.qualified,
		reward: typeof p.reward === 'string' ? p.reward : null,
		payoutEmail: typeof p.payoutEmail === 'string' ? p.payoutEmail : null,
		tasksDone: typeof p.tasksDone === 'number' ? p.tasksDone : 0,
		tasksTotal: typeof p.tasksTotal === 'number' ? p.tasksTotal : 0,
	}
}

async function finaliseSession(
	apiUrl: string,
	sessionId: string,
	durationSeconds: number,
	extras: {
		mutedSegments?: MutedSegment[]
		endNote?: string | null
		notes?: FinaliseNote[]
		// Replay linkage. sdkSessionId is the primary, always-available key:
		// the server resolves the SessionReplay by (clientId + sdkSessionId)
		// and sets UserTestSession.sessionReplayId. replayOffsetMs is the
		// offset captured at session start, only present when replay was
		// active. Both optional so older servers tolerate their absence and a
		// test with no replay still finalises cleanly.
		sdkSessionId?: string
		replayOffsetMs?: number
	} = {},
): Promise<FinaliseResult> {
	try {
		const body: Record<string, unknown> = {
			durationSeconds: Math.max(0, Math.round(durationSeconds)),
		}
		if (extras.mutedSegments && extras.mutedSegments.length > 0) {
			body.mutedSegments = extras.mutedSegments
		}
		const trimmedEndNote = extras.endNote?.trim()
		if (trimmedEndNote) body.endNote = trimmedEndNote
		if (extras.notes && extras.notes.length > 0) {
			// Server caps at 200; trim defensively here too.
			body.notes = extras.notes.slice(0, 200).map(n => ({
				atMs: Math.max(0, Math.round(n.atMs)),
				text: n.text,
			}))
		}
		if (extras.sdkSessionId) body.sdkSessionId = extras.sdkSessionId
		if (typeof extras.replayOffsetMs === 'number') {
			body.replayOffsetMs = Math.max(0, Math.round(extras.replayOffsetMs))
		}
		const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/user-test-sessions/${encodeURIComponent(sessionId)}/finalise`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			keepalive: true,
		})
		if (!res.ok) return { ok: false, payment: null }
		let payment: PaymentSummary | null = null
		try {
			const json = (await res.json()) as { payment?: unknown }
			payment = parsePaymentSummary(json.payment)
		} catch {
			// Older server or non-JSON body: degrade to neutral thanks screen.
		}
		return { ok: true, payment }
	} catch {
		return { ok: false, payment: null }
	}
}

// POST the participant's payout destination to the SaaS side. Best-effort with a
// single retry; the destination defaults server-side to the testerEmail when we
// send only `method`, so a dropped call still leaves a payable session. Returns
// ok so the UI can confirm or surface a soft error.
async function postPayout(
	apiUrl: string,
	sessionId: string,
	destination: string | null,
	logger: PluginContext['logger'],
): Promise<boolean> {
	const url = `${apiUrl.replace(/\/$/, '')}/api/user-test-sessions/${encodeURIComponent(sessionId)}/payout`
	const body: Record<string, unknown> = { method: 'email' }
	if (destination) body.destination = destination
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
				keepalive: true,
			})
			if (res.ok) return true
			// 4xx won't improve on retry (bad email, etc.).
			if (res.status >= 400 && res.status < 500) {
				logger.warn(`payout rejected with ${res.status}`)
				return false
			}
		} catch (err) {
			logger.warn(`payout attempt ${attempt + 1} failed`, err)
		}
		await new Promise(resolve => setTimeout(resolve, 400 + Math.floor(Math.random() * 200)))
	}
	return false
}

interface PostNoteResult {
	ok: boolean
	id?: string
	transient: boolean // true on network error / 5xx — eligible for retry
}

async function postNoteOnce(
	apiUrl: string,
	sessionId: string,
	atMs: number,
	text: string,
	logger: PluginContext['logger'],
): Promise<PostNoteResult> {
	try {
		const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/user-test-sessions/${encodeURIComponent(sessionId)}/notes`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ atMs: Math.max(0, Math.round(atMs)), text }),
			keepalive: true,
		})
		if (!res.ok) {
			logger.warn(`note POST rejected with ${res.status}`)
			return { ok: false, transient: res.status >= 500 || res.status === 408 || res.status === 429 }
		}
		// Best-effort id extraction; failures here don't matter for ack.
		let id: string | undefined
		try {
			const json = (await res.json()) as { id?: unknown }
			if (typeof json.id === 'string') id = json.id
		} catch { /* ignore */ }
		return { ok: true, id, transient: false }
	} catch (err) {
		logger.warn('note POST failed', err)
		return { ok: false, transient: true }
	}
}

// One immediate retry on transient errors. If still failing, defer to
// finalise batching via the un-acked notes channel.
async function postNoteWithRetry(
	apiUrl: string,
	sessionId: string,
	atMs: number,
	text: string,
	logger: PluginContext['logger'],
): Promise<PostNoteResult> {
	const first = await postNoteOnce(apiUrl, sessionId, atMs, text, logger)
	if (first.ok || !first.transient) return first
	await new Promise(resolve => setTimeout(resolve, 400 + Math.floor(Math.random() * 200)))
	return postNoteOnce(apiUrl, sessionId, atMs, text, logger)
}


async function flushPendingFromIdb(store: RecorderStore, ctx: PluginContext): Promise<void> {
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
	// resumes from the next index, never re-using one already shipped.
	persistActiveSession(store, store.finishFlowRan ? 'paused' : 'active')
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

// Threshold rationale (dBFS, full-scale = 0):
//   - True failure is essentially digital silence: every sample ~0, so RMS is
//     -Infinity (or, with analyser float error, well below -80 dB).
//   - Confirmed-real speech in our captured data sits around -36 dB RMS.
//   - Quiet-but-present speech (a soft talker) sits around -40 to -50 dB.
// We set the bar at -60 dB: only treat the stream as silent when RMS is
// effectively zero. A -50 dB quiet voice is a full 10 dB ABOVE the line and
// will never trip it, so we never falsely stop a real (quiet) participant.
// This is deliberately conservative per the product decision: warn, never
// block, and never false-positive on a real voice.
const SILENCE_RMS_DB_THRESHOLD = -60

// dBFS for a fully-silent (all-zero) window is -Infinity. Floor it to a finite
// value so the pure decision function stays total and testable.
const SILENCE_FLOOR_DB = -100

// How long the analyser must read continuous silence before we surface the
// warning. ~1.8s at record start and as the sustained-silence window during
// recording. Long enough that a natural pause between sentences (which dips
// toward the floor for a fraction of a second) never trips it; short enough
// that a dead device is flagged almost immediately.
const SILENCE_SUSTAINED_MS = 1800

// How often the monitor samples the analyser.
const SILENCE_POLL_MS = 250

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

// Live monitor: wires an AnalyserNode onto the stream and polls it. Calls
// `onChange(silent)` only on transitions (silent <-> audible), debounced by
// SILENCE_SUSTAINED_MS so a brief between-words dip never flips the pill.
// Returns a teardown that closes the AudioContext and disconnects nodes.
interface SilenceMonitor {
	stop(): void
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

async function startRecording(store: RecorderStore, ctx: PluginContext): Promise<void> {
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

function toggleMute(store: RecorderStore): boolean {
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

function flushMuteIfActive(store: RecorderStore): void {
	if (!store.muted || store.mutedSinceMs === null) return
	const nowMs = Date.now() - store.startedAt
	if (nowMs > store.mutedSinceMs) {
		store.mutedSegments.push({ startMs: store.mutedSinceMs, endMs: nowMs })
	}
	store.mutedSinceMs = null
}

function stopRecording(store: RecorderStore): void {
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

// Pause the recording for a hard navigation (pagehide / tab hidden) WITHOUT
// finalising. The browser is about to tear down the MediaStream, so we stop the
// recorder and let its queued chunk uploads race the unload on `keepalive`. The
// session stays open server-side; it resumes on return (storage carries the
// resume pointer), or the server-side stale sweep finalises it after ~10 min if
// the participant never comes back. This replaces the old pagehide->finalise,
// which permanently closed a session the participant intended to continue.
//
// Idempotent + non-destructive: it does NOT set finishFlowRan or move the
// indicator to a terminal state, so a real Finish tap after resume still works.
// Safe to call repeatedly (stopRecording tolerates an already-stopped recorder).
function pauseFlow(store: RecorderStore): void {
	if (store.cancelled) return
	// Already finishing/finished for real: nothing to pause.
	if (store.finishFlowRan || store.indicatorState === 'finishing' || store.indicatorState === 'done') return
	// No live session yet (still creating/adopting): nothing to persist or stop.
	if (!store.sessionId) return
	flushMuteIfActive(store)
	stopRecording(store)
	// Mark the persisted state paused at the current chunk index. The queued
	// uploads (each `keepalive` where small enough) continue draining as the
	// page unloads; the resume picks up from store.chunkIndex.
	persistActiveSession(store, 'paused')
}

async function finishFlow(store: RecorderStore, ctx: PluginContext, opts: { showThanks: boolean }): Promise<void> {
	if (store.cancelled) return
	// Short-circuit re-entry. The pagehide handler and the manual Finish click
	// can race; server is also idempotent on a second finalise call, but doing
	// the local work twice (flushing mute, draining queues, etc.) is wasted.
	if (store.finishFlowRan) return
	if (store.indicatorState === 'finishing' || store.indicatorState === 'done') return
	store.finishFlowRan = true
	store.indicatorState = 'finishing'
	flushMuteIfActive(store)
	renderIndicatorState(store)

	stopRecording(store)
	// Wait for the queued uploads to drain. Each upload already has its own
	// retry/backoff; this just lets them finish before finalise fires.
	await store.uploadQueue
	await flushPendingFromIdb(store, ctx)

	const durationSeconds = (Date.now() - store.startedAt) / 1000
	// Replay linkage, computed once and sent on every finalise call for this
	// session. sdkSessionId is the core-owned per-tab id (the primary key the
	// server uses to resolve the SessionReplay); replayOffsetMs is the offset
	// captured at session start, only set when replay was active. Both degrade
	// gracefully to absent. Sending it on the second (end-note) finalise too
	// is harmless: the server stores idempotently.
	const replayLinkage: { sdkSessionId?: string; replayOffsetMs?: number } = {}
	const linkageSdkSessionId = ctx.getSdkSessionId ? ctx.getSdkSessionId() : undefined
	if (linkageSdkSessionId) replayLinkage.sdkSessionId = linkageSdkSessionId
	if (store.replayOffsetAtStartMs !== null) {
		replayLinkage.replayOffsetMs = store.replayOffsetAtStartMs
	}
	// Payment summary from the first finalise response drives the finished screen
	// (complete vs ended-early, reward headline, one-tap payout default).
	let payment: PaymentSummary | null = null
	if (store.sessionId) {
		// First finalise carries durationSeconds + mutedSegments + any un-acked
		// notes (recovery channel). End-of-test note is sent via a second
		// finalise call from the thanks screen.
		const unackedNotes = store.notes.filter(n => !n.acked).map(n => ({ atMs: n.atMs, text: n.text }))
		const result = await finaliseSession(store.options.apiUrl, store.sessionId, durationSeconds, {
			mutedSegments: store.mutedSegments,
			notes: unackedNotes,
			...replayLinkage,
		})
		if (result.ok) {
			payment = result.payment
			// Mark the un-acked notes we just shipped as acked so the second
			// finalise call doesn't resend them.
			for (const n of store.notes) {
				if (!n.acked) n.acked = true
			}
		}
		store.indicatorState = result.ok ? 'done' : 'error'
		// Genuine, server-confirmed finalisation: clear the persisted resume
		// state so a later unrelated visit never tries to resume this closed
		// session. On error we keep it so the resume / server stale sweep can
		// still own the session.
		if (result.ok) clearActiveSession()
	} else {
		store.indicatorState = 'error'
	}
	renderIndicatorState(store)

	if (opts.showThanks && store.indicatorRoot && store.indicatorState === 'done') {
		showThanksScreen(store.indicatorRoot, {
			payment,
			onPayout: async destination => {
				if (!store.sessionId) return false
				return postPayout(store.options.apiUrl, store.sessionId, destination, ctx.logger)
			},
			onResume: () => {
				// Re-arm an ended-early session: the recording was already stopped +
				// finalised, so resuming starts a fresh recording leg under the same
				// sessionId. The server is idempotent on a later finalise; the new
				// audio chunks continue the same R2 prefix. Reset the finish guard
				// and timeline anchor so the next Finish re-evaluates completion.
				store.finishFlowRan = false
				store.indicatorState = 'recording'
				store.startedAt = Date.now()
				store.muted = false
				store.mutedSinceMs = null
				// Re-arm the persisted resume state: the participant chose to keep
				// going, so a hard navigation during this new leg should resume too.
				persistActiveSession(store, 'active')
				renderIndicatorState(store)
				void startRecording(store, ctx)
			},
			onSubmitNote: async text => {
				if (!store.sessionId) return
				store.endNote = text
				// Second finalise only carries the late-binding fields. mutedSegments
				// already landed on call 1, server stores idempotently, no need to
				// resend. Include any notes that arrived (or failed to ack) between
				// the two calls.
				const stillUnacked = store.notes.filter(n => !n.acked).map(n => ({ atMs: n.atMs, text: n.text }))
				const result = await finaliseSession(store.options.apiUrl, store.sessionId, durationSeconds, {
					endNote: text,
					notes: stillUnacked,
					...replayLinkage,
				})
				if (!result.ok) throw new Error('finalise failed')
				for (const n of store.notes) {
					if (!n.acked) n.acked = true
				}
			},
			onSkip: () => { /* nothing to send */ },
		})
	}
}

export function userTest(options: UserTestOptions = {}): UseroPlugin {
	const merged: Required<UserTestOptions> = {
		queryParam: options.queryParam ?? DEFAULT_OPTIONS.queryParam,
		chunkSeconds: options.chunkSeconds ?? DEFAULT_OPTIONS.chunkSeconds,
		apiUrl: options.apiUrl ?? DEFAULT_OPTIONS.apiUrl,
		testerName: options.testerName ?? DEFAULT_OPTIONS.testerName,
		hideIndicator: options.hideIndicator ?? DEFAULT_OPTIONS.hideIndicator,
	}

	return {
		name: 'user-test',
		onInit(ctx) {
			if (typeof window === 'undefined' || typeof document === 'undefined') return
			const urlSlug = getTestSlug(merged.queryParam)
			// Resume source of truth: a non-stale persisted session for THIS origin
			// means a test is in progress, even when the URL no longer carries
			// `?usero_test`/`uts` (the common case after an OAuth round-trip strips
			// the params). We resume it unless the URL explicitly names a DIFFERENT
			// slug (a fresh test on the same origin supersedes a stale-but-in-window
			// leftover, so we drop the old one rather than resuming the wrong test).
			const resumeState = readActiveSession()
			const resumable = resumeState && (!urlSlug || urlSlug === resumeState.slug) ? resumeState : null
			if (resumeState && !resumable) {
				// URL names a different test than the persisted one: the old session
				// is abandoned in favour of the new test. Clear it so we don't leave
				// a dangling resume pointer (the server stale sweep finalises it).
				clearActiveSession()
			}

			const slug = resumable?.slug ?? urlSlug
			if (!slug) return
			const isResume = resumable !== null

			// CRITICAL replay-link fix: re-seat the per-tab sdkSessionId from the
			// durable resume state SYNCHRONOUSLY, before anything else. A cross-origin
			// hard nav wiped sessionStorage, so without this the resumed session-replay
			// plugin would mint a NEW sdkSessionId; the post-nav replay row would then
			// no longer share an id with this audio session, the finalise
			// (clientId, sdkSessionId) join would miss, and the dashboard would hide a
			// perfectly-recorded replay. reseatSdkSessionId writes sessionStorage AND
			// the core cache, so it corrects the id whether session-replay's onInit
			// runs after this (reads the re-seated value) or already ran (cache fixed,
			// and its own finalise reads through the cache). No-ops on a bad/absent id.
			if (isResume && resumable?.sdkSessionId && ctx.reseatSdkSessionId) {
				ctx.reseatSdkSessionId(resumable.sdkSessionId)
			}

			const apiUrl = merged.apiUrl || ctx.baseUrl || DEFAULT_API_URL
			const store: RecorderStore = {
				cancelled: false,
				slug,
				sessionId: null,
				clientId: null,
				recorder: null,
				stream: null,
				// On resume, continue the chunk index so we never overwrite a chunk
				// already shipped in the pre-navigation leg.
				chunkIndex: resumable?.nextChunkIndex ?? 0,
				uploadQueue: Promise.resolve(),
				pendingUploads: 0,
				// On resume, keep the ORIGINAL session start so duration + staleness
				// stay anchored to when the test actually began, not the return moment.
				startedAt: resumable?.startedAt ?? Date.now(),
				indicator: null,
				indicatorRoot: null,
				indicatorState: 'recording',
				pageHideHandler: null,
				visibilityHandler: null,
				options: { ...merged, apiUrl },
				tasks: [],
				tasksPanelOpen: readTasksPanelOpen(),
				outsidePointerHandler: null,
				keydownHandler: null,
				hasMicPermission: false,
				micAcquiring: true,
				micFailReason: null,
				muted: false,
				mutedSinceMs: null,
				mutedSegments: [],
				micSilent: false,
				silenceMonitor: null,
				muteToastShown: false,
				muteToastTimers: [],
				resumeToastTimers: [],
				notes: [],
				notesPopoverOpen: false,
				notePopoverAtMs: null,
				endNote: '',
				finishFlowRan: false,
				resumed: isResume,
				sdkSessionId: null,
				replayOffsetAtStartMs: null,
			}
			ctx.setStore(store)

			const onFinish = (): void => {
				void finishFlow(store, ctx, { showThanks: true })
			}

			const setPanelOpen = (open: boolean): void => {
				if (store.tasksPanelOpen === open) return
				store.tasksPanelOpen = open
				writeTasksPanelOpen(open)
				renderTasksPanel(store)
			}

			const onToggleTasks = (): void => setPanelOpen(!store.tasksPanelOpen)

			const onToggleMute = (): void => {
				if (!store.hasMicPermission) {
					// In the failed terminal state the chip is a retry button:
					// re-attempt mic acquisition. Ignore taps while still
					// acquiring (connecting state is unfocusable anyway).
					if (!store.micAcquiring && store.indicatorState !== 'finishing' && store.indicatorState !== 'done' && store.indicatorState !== 'error') {
						void startRecording(store, ctx)
					}
					return
				}
				// Silent-mic warning is also a retry affordance: the participant
				// has likely switched their input device, so re-acquire the mic
				// rather than toggling mute. startRecording tears down the old
				// stream + monitor and re-runs detection on the fresh track.
				if (store.micSilent && !store.micAcquiring && store.indicatorState !== 'finishing' && store.indicatorState !== 'done' && store.indicatorState !== 'error') {
					void startRecording(store, ctx)
					return
				}
				const ok = toggleMute(store)
				if (!ok) return
				if (store.muted) {
					// Muting is intentional silence: drop any active silent-mic
					// warning so the two states don't fight. The monitor's
					// onChange suppresses re-raising it while muted.
					store.micSilent = false
					showMuteToast(store)
				}
				renderIndicatorState(store)
			}

			const closeNote = (): void => closeNotePopover(store)
			const onOpenNote = (): void => {
				if (store.notesPopoverOpen) { closeNote(); return }
				openNotePopover(
					store,
					text => {
						const atMs = store.notePopoverAtMs ?? Math.max(0, Date.now() - store.startedAt)
						const note: InFlightNote = { atMs, text, acked: false }
						store.notes.push(note)
						closeNote()
						renderNotesCount(store)
						// UI never blocks on the POST. On success we mark the note
						// acked; on failure (after one retry) it stays unacked and
						// gets included in the finalise notes batch as a recovery
						// channel. Server dedupes by (sessionId, atMs, text).
						if (store.sessionId) {
							const sessionId = store.sessionId
							void (async (): Promise<void> => {
								const result = await postNoteWithRetry(store.options.apiUrl, sessionId, atMs, text, ctx.logger)
								if (result.ok) {
									note.acked = true
									if (result.id) note.serverId = result.id
								}
							})()
						}
					},
					() => closeNote(),
				)
			}

			if (!merged.hideIndicator) {
				const host = document.createElement('div')
				host.setAttribute('data-usero-user-test', 'true')
				document.body.appendChild(host)
				store.indicator = host
				store.indicatorRoot = buildIndicator(host, store, {
					onFinish,
					onToggleTasks,
					onToggleMute,
					onOpenNote,
				})
				renderIndicatorState(store)
				renderNotesCount(store)
			}

			// Outside-click + Escape close the tasks panel. Listen on document
			// (composedPath checks shadow ancestry so taps on the panel/pill
			// itself don't dismiss).
			const outsidePointer = (event: PointerEvent): void => {
				const host = store.indicator
				if (!host) return
				const path = event.composedPath()
				if (path.includes(host)) return
				if (store.tasksPanelOpen) setPanelOpen(false)
				if (store.notesPopoverOpen) closeNote()
			}
			const onKeydown = (event: KeyboardEvent): void => {
				if (event.key !== 'Escape') return
				if (store.tasksPanelOpen) setPanelOpen(false)
				if (store.notesPopoverOpen) closeNote()
			}
			store.outsidePointerHandler = outsidePointer
			store.keydownHandler = onKeydown
			document.addEventListener('pointerdown', outsidePointer, true)
			document.addEventListener('keydown', onKeydown)

			const pageHide = (): void => {
				// PAUSE, do not finalise. A hard navigation (e.g. an OAuth round
				// trip) destroys the MediaStream, but the session must survive so
				// recording resumes on return. We stop the recorder, mark the
				// persisted state paused, and let queued chunk uploads race the
				// unload on `keepalive`. Finalisation now comes only from an
				// explicit Finish tap or the server-side stale sweep (~10 min of
				// no chunks). See pauseFlow.
				pauseFlow(store)
			}
			store.pageHideHandler = pageHide
			window.addEventListener('pagehide', pageHide)

			// visibilitychange -> hidden is the reliable mobile backstop: iOS
			// frequently backgrounds/kills a tab WITHOUT firing pagehide. It runs
			// the SAME pause path; pauseFlow is idempotent and non-terminal, so a
			// later Finish tap (or a resume) still works after the tab returns to
			// the foreground. We don't finalise here either, for the same reason.
			const onVisibilityChange = (): void => {
				if (document.visibilityState !== 'hidden') return
				pauseFlow(store)
			}
			store.visibilityHandler = onVisibilityChange
			document.addEventListener('visibilitychange', onVisibilityChange)

			void (async (): Promise<void> => {
				// Resolve the session for this leg. Three paths:
				//   1. RESUME (storage has a non-stale session): ADOPT the existing
				//      id. Never create a new one. Works even when the URL lost its
				//      `?usero_test`/`uts` params after a hard navigation.
				//   2. Entry-screen created session (`uts` in URL): ADOPT it.
				//   3. Open test (old link, no uts): CREATE a fresh session.
				// adopt is an idempotent GET, so re-adopting a still-active session
				// on resume is safe and does not disturb its server state.
				const adoptId = resumable?.sessionId ?? getAdoptSessionId()
				const created = adoptId
					? await adoptSession(apiUrl, adoptId)
					: await createSession(apiUrl, slug, readTesterName(merged.testerName))
				if (store.cancelled) return
				if (!created) {
					ctx.logger.error(adoptId ? 'failed to adopt user-test session' : 'failed to create user-test session')
					// A resume that can't re-adopt its session (server says gone, or
					// network down) clears the stale pointer so we don't loop trying
					// to resume a session that no longer exists.
					if (isResume) clearActiveSession()
					store.indicatorState = 'error'
					renderIndicatorState(store)
					return
				}
				store.sessionId = created.sessionId
				store.clientId = created.clientId
				// Resolve the per-tab sdkSessionId now (once) so it can be durably
				// mirrored into the resume state and sent on finalise. On resume this
				// is the SAME id we re-seated synchronously above (so the post-nav
				// replay row joins this audio session); on a fresh start it is the
				// tab's id. Null when replay/core accessor is absent (no link to keep).
				store.sdkSessionId = ctx.getSdkSessionId ? ctx.getSdkSessionId() : null
				// Persist (or refresh) the resume pointer now that we have a session
				// id (and the sdkSessionId), BEFORE the first chunk flushes, so a hard
				// navigation in the first few seconds of recording still resumes AND
				// keeps the replay link.
				persistActiveSession(store, 'active')
				// Capture the replay offset HERE at session start (not at
				// finalise) so it reflects when the test began relative to the
				// recording. The replay plugin publishes its start epoch into
				// the core; we read it via the context. If replay is not active
				// (plugin not loaded, sampled out, or an older host without the
				// accessor) we leave it null and the finalise body omits
				// replayOffsetMs. Anchored to store.startedAt (test start),
				// clamped >= 0 in case the test starts a hair before the replay
				// epoch is published.
				const replayStartMs = ctx.getReplayStartMs ? ctx.getReplayStartMs() : null
				store.replayOffsetAtStartMs =
					replayStartMs === null ? null : Math.max(0, store.startedAt - replayStartMs)
				store.tasks = created.tasks
				if (store.tasks.length > 0 && store.indicatorRoot && !merged.hideIndicator) {
					const bar = store.indicatorRoot.querySelector('.bar')
					const finishBtn = bar?.querySelector('.finish-btn')
					if (bar instanceof HTMLElement && finishBtn instanceof HTMLElement && !bar.querySelector('.tasks-btn')) {
						installTasksToggle(bar, finishBtn, store, onToggleTasks)
					}
					renderTasksPanel(store)
				}
				await startRecording(store, ctx)
				renderIndicatorState(store)
				// Recorder is live again. If this leg was a resume across a hard
				// navigation, give the participant a brief, unobtrusive confirmation
				// that the test is still recording. No-op on a fresh start (the guard
				// checks store.resumed and clears it so it fires at most once).
				showResumedToast(store)
			})()
		},
		onDestroy(ctx) {
			const store = ctx.getStore<RecorderStore>()
			if (!store) return
			store.cancelled = true
			if (store.pageHideHandler) {
				window.removeEventListener('pagehide', store.pageHideHandler)
				store.pageHideHandler = null
			}
			if (store.visibilityHandler) {
				document.removeEventListener('visibilitychange', store.visibilityHandler)
				store.visibilityHandler = null
			}
			stopRecording(store)
			if (store.outsidePointerHandler) {
				document.removeEventListener('pointerdown', store.outsidePointerHandler, true)
				store.outsidePointerHandler = null
			}
			if (store.keydownHandler) {
				document.removeEventListener('keydown', store.keydownHandler)
				store.keydownHandler = null
			}
			for (const id of store.muteToastTimers) {
				try { window.clearTimeout(id) } catch { /* ignore */ }
			}
			store.muteToastTimers = []
			for (const id of store.resumeToastTimers) {
				try { window.clearTimeout(id) } catch { /* ignore */ }
			}
			store.resumeToastTimers = []
			if (store.indicator && store.indicator.parentNode) {
				store.indicator.parentNode.removeChild(store.indicator)
			}
			store.indicator = null
			store.indicatorRoot = null
		},
	}
}

// Internal helpers exposed for tests only. Not part of the public API.
export const __test__ = {
	getTestSlug,
	pickMimeType,
	isMediaRecorderSupported,
	micChipState,
	isStreamSilent,
	rmsDbFromSamples,
	SILENCE_RMS_DB_THRESHOLD,
	SILENCE_FLOOR_DB,
	parseActiveSession,
	ACTIVE_SESSION_MAX_AGE_MS,
}
