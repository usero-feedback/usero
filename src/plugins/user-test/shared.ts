// Shared types, constants, and inline icon assets for the user-test plugin.
// Pure data + type declarations only: no DOM, no network, no logic. Every other
// module in this directory imports from here so the literals live in one place.

import type { PluginContext } from '../../plugin'
import { DEFAULT_API_URL } from '../../types'

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

export interface UserTestTask {
	id: string
	prompt: string
	sortOrder: number
}

export interface MutedSegment {
	startMs: number
	endMs: number
}

export interface InFlightNote {
	atMs: number
	text: string
	acked: boolean
	serverId?: string
}

export interface RecorderStore {
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
	// Teardown for the visualViewport keyboard-inset watcher that keeps the
	// floating bar/panel above the mobile soft keyboard. Null when the
	// indicator is hidden or visualViewport is unsupported.
	keyboardWatcherCleanup: (() => void) | null
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
	// Set once the chunk-upload path sees a definitive "session closed" signal
	// from the server (409 + closeResume: true, raised when finalise has already
	// snapshotted the session). Guards against running the terminal close flow
	// twice when several queued chunks all get rejected. Once true, enqueueChunk
	// drops further chunks rather than stashing them for a retry that can never
	// land.
	sessionClosed: boolean
	// Terminal-close handler, wired in the entry module where the indicatorRoot
	// and hideIndicator option are in scope. Invoked once by the chunk-upload
	// path when the server reports the session is closed: it stops recording,
	// clears the persisted resume state, and shows the "session ended" screen.
	// Null until the entry module wires it (and when there's nothing to close).
	onSessionClosed: (() => void) | null
	// True once pauseFlow has run for a hard navigation (page hidden mid-test).
	// Set BEFORE stopRecording() so the final trailing `dataavailable` chunk that
	// stopRecording triggers persists as 'paused' (keeping pausedAt), not 'active'.
	// Without this the trailing enqueueChunk rewrote the entry to 'active' and
	// dropped pausedAt, defeating the RESUME_MAX_IDLE_MS idle gate. Reset to false
	// on a successful resume (the recorder is live again).
	paused: boolean
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

export const DEFAULT_OPTIONS: Required<Omit<UserTestOptions, 'testerName' | 'apiUrl'>> & {
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

export const TESTER_NAME_STORAGE_KEY = 'usero:user-test:tester-name'
export const TASKS_PANEL_OPEN_STORAGE_KEY = 'usero:user-test:tasks-panel-open'
// Per-origin resume state. A single active user-test session per origin: the
// participant can only be inside one test at a time, so we don't key by slug.
// localStorage (not sessionStorage) so the entry survives a hard cross-origin
// navigation away-and-back (e.g. an OAuth round-trip) within the same tab.
export const ACTIVE_SESSION_STORAGE_KEY = 'usero:user-test:active-session'
// A persisted active session older than this is treated as stale and ignored on
// init, so a long-abandoned entry can never silently start recording on an
// unrelated later visit. Matches the spirit of the server-side stale sweep.
export const ACTIVE_SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000 // 2h
// Max idle time between the page hiding (pauseFlow writes pausedAt) and the
// participant returning, for a paused session to still be RESUME-eligible. The
// 2h ACTIVE_SESSION_MAX_AGE_MS cap is anchored to startedAt (test start) and is
// never refreshed, so without this an unrelated return to the origin within 2h
// would re-adopt the test and silently re-acquire the mic. 30 min is a sane
// "they stepped away and came back" bound; longer idle => session is abandoned.
export const RESUME_MAX_IDLE_MS = 30 * 60 * 1000 // 30m
export const IDB_NAME = 'usero-user-test'
export const IDB_STORE = 'pending-chunks'

// Persisted resume state. Written when recording starts and updated as the
// chunk index advances; read on init to resume across a hard navigation.
//   - `status`: 'active' while recording, 'paused' once the page hid mid-test.
//     Both resume the same way; the flag is informational (and lets a future
//     UI distinguish "came back from a pause" if it wants to).
//   - `nextChunkIndex`: the chunk index the resumed recorder continues from.
//     The server stitches chunks, and the container remux tolerates the extra
//     WebM header the fresh post-resume recorder emits.
export interface ActiveSessionState {
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
	// Wall-clock ms when the page last hid mid-test (pauseFlow). Distinct from
	// startedAt (test start, used for duration/anchoring, never refreshed).
	// Resume eligibility is gated on time-since-pausedAt (RESUME_MAX_IDLE_MS) so
	// returning to the origin hours later for an UNRELATED reason can't silently
	// re-adopt the test and re-acquire the mic. Absent until the first pause.
	pausedAt?: number
}

export interface PendingChunk {
	id: string
	sessionId: string
	apiUrl: string
	chunkIndex: number
	blob: Blob
	createdAt: number
}

export interface IndicatorCallbacks {
	onFinish: () => void
	onToggleTasks: () => void
	onToggleMute: () => void
	onOpenNote: () => void
}

// Result of adopting (or re-adopting on resume) a server-created session.
//   - 'ok': adopted, carry on recording.
//   - 'closed': the server rejected with 409/410 because the session is already
//     completed/failed (e.g. finalised by the stale sweep). The caller MUST
//     clear resume state and NOT start recording, so we never resurrect a closed
//     session and upload post-finalise chunks.
//   - 'error': not found / network / malformed. Treated as a hard failure (no
//     resume), same as the legacy null return.
export type AdoptResult =
	| { kind: 'ok'; sessionId: string; clientId: string; tasks: UserTestTask[] }
	| { kind: 'closed' }
	| { kind: 'error' }

// Outcome of a single chunk upload (after its internal retry loop). The chunk
// path must distinguish three cases, because each demands different handling:
//   - 'ok': the chunk landed (2xx, or the server's idempotent re-fire success).
//     Normal path, nothing more to do.
//   - 'closed': the server returned a definitive "session is closed" signal
//     (409 + closeResume: true, raised once finalise has snapshotted the
//     session). Recording must STOP, resume state must be cleared, and the
//     terminal screen shown. NEVER retry or stash: the chunk can never land.
//   - 'failed': a transient failure (network blip, 5xx, 408/429) that exhausted
//     the retry budget, OR a non-closing 4xx rejection. The session is still
//     considered live, so the chunk is stashed in IndexedDB for a later offline
//     flush. This is the pre-existing "return false" behaviour.
export type ChunkUploadOutcome = 'ok' | 'closed' | 'failed'

export interface FinaliseNote {
	atMs: number
	text: string
}

// Participant-facing payment summary the finalise endpoint returns on the FIRST
// call. Drives the finished screen: `qualified` picks the complete vs ended-early
// layout, `reward` is the formatted headline (e.g. "$15"), `payoutEmail` seeds the
// one-tap payout default, tasksDone/tasksTotal drive the ended-early missing line.
// Every field is optional so an older server (no `payment` block) degrades to the
// neutral "thanks, saved" screen rather than throwing.
export interface PaymentSummary {
	qualified: boolean
	reward: string | null
	payoutEmail: string | null
	tasksDone: number
	tasksTotal: number
}

export interface FinaliseResult {
	ok: boolean
	// Only present on the first finalise call (the server computes it once).
	payment: PaymentSummary | null
}

export interface PostNoteResult {
	ok: boolean
	id?: string
	transient: boolean // true on network error / 5xx — eligible for retry
}

export interface ThanksOptions {
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

// Live monitor: wires an AnalyserNode onto the stream and polls it. Calls
// `onChange(silent)` only on transitions (silent <-> audible), debounced by
// SILENCE_SUSTAINED_MS so a brief between-words dip never flips the pill.
// Returns a teardown that closes the AudioContext and disconnects nodes.
export interface SilenceMonitor {
	stop(): void
}

// ---------------------------------------------------------------------------
// Silent-microphone guard thresholds
//
// A dead mic, or a virtual audio input device that macOS hands Chrome (e.g.
// "Background Music", a Zoom/Teams virtual mic), delivers digital silence.
// getUserMedia succeeds, MediaRecorder records, and 15 minutes of nothing
// reaches the researcher with no warning. We DETECT a silent input stream and
// WARN the participant (non-blocking: recording always continues).

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
export const SILENCE_RMS_DB_THRESHOLD = -60

// dBFS for a fully-silent (all-zero) window is -Infinity. Floor it to a finite
// value so the pure decision function stays total and testable.
export const SILENCE_FLOOR_DB = -100

// How long the analyser must read continuous silence before we surface the
// warning. ~1.8s at record start and as the sustained-silence window during
// recording. Long enough that a natural pause between sentences (which dips
// toward the floor for a fraction of a second) never trips it; short enough
// that a dead device is flagged almost immediately.
export const SILENCE_SUSTAINED_MS = 1800

// How often the monitor samples the analyser.
export const SILENCE_POLL_MS = 250

// Inline SVGs kept tiny. currentColor so they inherit the chip text color.
export const MIC_ICON_SVG = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="13" height="13"><path d="M8 1.5a2 2 0 0 0-2 2v4a2 2 0 1 0 4 0v-4a2 2 0 0 0-2-2Z" fill="currentColor"/><path d="M4 7.5a4 4 0 0 0 8 0M8 11.5v3M5.5 14.5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`
export const MIC_MUTED_ICON_SVG = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="13" height="13"><path d="M8 1.5a2 2 0 0 0-2 2v3.2L10 11V3.5a2 2 0 0 0-2-2Z" fill="currentColor"/><path d="M4 7.5a4 4 0 0 0 6.5 3.12M12 7.5a4 4 0 0 1-.3 1.5M8 11.5v3M5.5 14.5h5M2 2l12 12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`
export const NOTE_ICON_SVG = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14"><path d="M3 3.5A1.5 1.5 0 0 1 4.5 2h7A1.5 1.5 0 0 1 13 3.5V10a1.5 1.5 0 0 1-1.5 1.5H7L4 14v-2.5h-.5A1.5 1.5 0 0 1 2 10V3.5A1.5 1.5 0 0 1 3.5 3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
// Thanks-screen icons: bold tick (medallion + done rows) and a clock (ended early).
export const TICK_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 12.5 10 17.5 19 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
export const TICK_SM_SVG = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.5 8.5 6.5 11.5 12.5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
export const CLOCK_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8.4" stroke="currentColor" stroke-width="2"/><path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
export const SPARK_ICON_SVG = `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 1.5 9.5 6.5 14.5 8 9.5 9.5 8 14.5 6.5 9.5 1.5 8 6.5 6.5Z" fill="currentColor"/></svg>`
// Calm "wrapped up" mark for the terminal ended-session screen: a finish flag,
// not a celebratory tick (this is a neutral end state, not a passing reward).
export const FLAG_ICON_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 21V4M6 4.5h9.5l-1.6 3.2 1.6 3.2H6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`

// Re-exported for convenience where modules need the logger type.
export type Logger = PluginContext['logger']
