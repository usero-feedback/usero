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
//   4. On Finish (or `pagehide`), flushes any buffered chunks and calls
//      POST /api/user-test-sessions/:id/finalise.
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
	// but more requests. Default 30.
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
	options: Required<UserTestOptions>
	tasks: UserTestTask[]
	tasksPanelOpen: boolean
	outsidePointerHandler: ((event: PointerEvent) => void) | null
	keydownHandler: ((event: KeyboardEvent) => void) | null
	// Mic mute
	hasMicPermission: boolean
	muted: boolean
	mutedSinceMs: number | null
	mutedSegments: MutedSegment[]
	muteToastShown: boolean
	muteToastTimers: number[]
	// In-flight notes
	notes: InFlightNote[]
	notesPopoverOpen: boolean
	notePopoverAtMs: number | null
	// End-of-test comment (collected on thanks screen)
	endNote: string
	// Re-entry guard for finishFlow.
	finishFlowRan: boolean
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
	chunkSeconds: 30,
	apiUrl: DEFAULT_API_URL,
	testerName: '',
	hideIndicator: false,
}

const TESTER_NAME_STORAGE_KEY = 'usero:user-test:tester-name'
const TASKS_PANEL_OPEN_STORAGE_KEY = 'usero:user-test:tasks-panel-open'
const IDB_NAME = 'usero-user-test'
const IDB_STORE = 'pending-chunks'

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
		.mic[data-mic-state="none"] {
			background: rgba(255,255,255,0.04);
			color: rgba(255,255,255,0.55);
			cursor: default;
		}
		.mic[data-mic-state="none"]:hover { background: rgba(255,255,255,0.04); }
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

		/* Thanks overlay + end-of-test note */
		.thanks {
			position: fixed; inset: 0;
			display: grid; place-items: center;
			background: rgba(15, 15, 17, 0.78);
			backdrop-filter: blur(6px);
			-webkit-backdrop-filter: blur(6px);
			color: #fff;
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
			z-index: 2147483647;
			padding: 24px;
			text-align: center;
		}
		.thanks-card {
			background: #fff; color: #111;
			border-radius: 18px; padding: 28px 24px;
			max-width: 420px; width: 100%;
			box-shadow: 0 20px 50px rgba(0,0,0,0.25);
			text-align: left;
		}
		.thanks-card .head { text-align: center; }
		.thanks h2 { margin: 0 0 6px; font-size: 20px; }
		.thanks .lede { margin: 0 0 18px; font-size: 14px; line-height: 1.45; color: #4b5563; text-align: center; }
		.thanks .check {
			width: 44px; height: 44px; border-radius: 50%;
			background: #10b981; color: #fff;
			display: grid; place-items: center;
			margin: 0 auto 12px;
			font-size: 22px;
		}
		.thanks .end-label {
			display: block; margin: 0 0 8px;
			font-size: 13px; font-weight: 500; color: #374151;
		}
		.thanks .end-textarea {
			width: 100%; box-sizing: border-box;
			min-height: 96px; resize: vertical;
			padding: 11px 12px;
			background: #f9fafb;
			border: 1px solid #e5e7eb;
			border-radius: 10px;
			font: inherit; font-size: 14px; line-height: 1.5;
			color: #111;
			transition: border-color 0.15s ease, background 0.15s ease;
		}
		.thanks .end-textarea:focus {
			outline: none; border-color: #111; background: #fff;
		}
		.thanks .end-textarea::placeholder { color: #9ca3af; }
		.thanks .end-actions {
			display: flex; gap: 10px; margin-top: 14px;
		}
		.thanks .end-actions button {
			flex: 1;
			appearance: none; border: 1px solid #e5e7eb;
			background: #fff; color: #111;
			padding: 11px 14px; border-radius: 10px;
			font: inherit; font-weight: 600; font-size: 14px;
			cursor: pointer;
			transition: background 0.15s ease, border-color 0.15s ease;
		}
		.thanks .end-actions button:hover { background: #f3f4f6; }
		.thanks .end-actions button.primary {
			background: #111; color: #fff; border-color: #111;
		}
		.thanks .end-actions button.primary:hover { background: #1f2937; border-color: #1f2937; }
		.thanks .end-actions button:focus-visible { outline: 2px solid #111; outline-offset: 2px; }
		.thanks .end-hint {
			margin: 10px 0 0; font-size: 11.5px; color: #9ca3af; text-align: center;
		}
		.thanks .end-sent {
			margin-top: 14px; text-align: center; color: #4b5563; font-size: 13px;
		}

		@keyframes pulse {
			0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.55); }
			70% { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
			100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
		}
		@media (prefers-reduced-motion: reduce) {
			.dot { animation: none; }
			.toast, .note-popover { animation: none; }
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

function micChipState(store: RecorderStore): 'recording' | 'muted' | 'none' | 'inactive' {
	if (store.indicatorState === 'finishing' || store.indicatorState === 'done' || store.indicatorState === 'error') {
		return 'inactive'
	}
	if (!store.hasMicPermission) return 'none'
	return store.muted ? 'muted' : 'recording'
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
	mic.setAttribute('data-mic-state', chipState === 'inactive' ? 'none' : chipState)

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
		case 'none':
			micIcon.innerHTML = MIC_MUTED_ICON_SVG
			micLabel.textContent = 'No mic, replay only'
			mic.setAttribute('aria-label', 'Microphone not granted, replay only')
			mic.setAttribute('aria-pressed', 'false')
			mic.setAttribute('tabindex', '-1')
			break
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

function showThanksScreen(
	root: ShadowRoot,
	opts: { onSubmitNote: (text: string) => Promise<void> | void; onSkip: () => void },
): void {
	const overlay = document.createElement('div')
	overlay.className = 'thanks'

	const card = document.createElement('div')
	card.className = 'thanks-card'

	const head = document.createElement('div')
	head.className = 'head'
	head.innerHTML = `
		<div class="check" aria-hidden="true">&#10003;</div>
		<h2>Thanks for testing</h2>
		<p class="lede">Your session was saved. One last thing if you have a moment.</p>
	`

	const form = document.createElement('form')
	form.noValidate = true
	form.innerHTML = `
		<label class="end-label" for="usero-end-note">Anything you would add?</label>
		<textarea
			id="usero-end-note"
			class="end-textarea"
			rows="4"
			placeholder="Confusing bits, things you liked, what you'd change..."
		></textarea>
		<div class="end-actions">
			<button type="button" class="skip">Skip</button>
			<button type="submit" class="primary">Send</button>
		</div>
		<p class="end-hint">Cmd or Ctrl plus Enter to send. Either button is fine.</p>
	`

	card.appendChild(head)
	card.appendChild(form)
	overlay.appendChild(card)
	root.appendChild(overlay)

	const ta = form.querySelector<HTMLTextAreaElement>('#usero-end-note')
	const skipBtn = form.querySelector<HTMLButtonElement>('button.skip')
	if (!ta || !skipBtn) return

	const swapToSent = (message: string): void => {
		form.remove()
		const sent = document.createElement('p')
		sent.className = 'end-sent'
		sent.textContent = message
		card.appendChild(sent)
	}

	const ERROR_CLASS = 'end-error'
	const showError = (message: string): void => {
		// Remove any prior error so we don't stack them on repeated retries.
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
				// 30s timeout. fetch can hang on flaky networks; we don't want
				// the user staring at a disabled form forever.
				await Promise.race([
					Promise.resolve(opts.onSubmitNote(text)),
					new Promise<never>((_, reject) => {
						window.setTimeout(() => reject(new Error('timeout')), 30000)
					}),
				])
				swapToSent('Thanks. You can close this tab.')
			} catch {
				// Re-enable inputs so the user can retry. No emdashes in copy.
				ta.disabled = false
				skipBtn.disabled = false
				if (submitBtn) submitBtn.disabled = false
				showError("Couldn't save your note. Try again?")
			}
		} else {
			opts.onSkip()
			swapToSent('All good. You can close this tab.')
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

interface FinaliseNote {
	atMs: number
	text: string
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
): Promise<boolean> {
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
		const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/user-test-sessions/${encodeURIComponent(sessionId)}/finalise`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			keepalive: true,
		})
		return res.ok
	} catch {
		return false
	}
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

async function startRecording(store: RecorderStore, ctx: PluginContext): Promise<void> {
	if (!isMediaRecorderSupported()) {
		ctx.logger.warn('MediaRecorder not supported, continuing without audio')
		store.indicatorState = 'no-audio'
		renderIndicatorState(store)
		return
	}
	let stream: MediaStream
	try {
		stream = await navigator.mediaDevices.getUserMedia({ audio: true })
	} catch (err) {
		ctx.logger.warn('mic permission denied or unavailable', err)
		store.indicatorState = 'no-audio'
		renderIndicatorState(store)
		return
	}
	store.stream = stream
	store.hasMicPermission = true
	const mimeType = pickMimeType()
	let recorder: MediaRecorder
	try {
		recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
	} catch (err) {
		ctx.logger.error('MediaRecorder construction failed', err)
		stream.getTracks().forEach(t => t.stop())
		store.stream = null
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
	const sdkSessionId = ctx.getSdkSessionId ? ctx.getSdkSessionId() : undefined
	if (sdkSessionId) replayLinkage.sdkSessionId = sdkSessionId
	if (store.replayOffsetAtStartMs !== null) {
		replayLinkage.replayOffsetMs = store.replayOffsetAtStartMs
	}
	if (store.sessionId) {
		// First finalise carries durationSeconds + mutedSegments + any un-acked
		// notes (recovery channel). End-of-test note is sent via a second
		// finalise call from the thanks screen.
		const unackedNotes = store.notes.filter(n => !n.acked).map(n => ({ atMs: n.atMs, text: n.text }))
		const ok = await finaliseSession(store.options.apiUrl, store.sessionId, durationSeconds, {
			mutedSegments: store.mutedSegments,
			notes: unackedNotes,
			...replayLinkage,
		})
		if (ok) {
			// Mark the un-acked notes we just shipped as acked so the second
			// finalise call doesn't resend them.
			for (const n of store.notes) {
				if (!n.acked) n.acked = true
			}
		}
		store.indicatorState = ok ? 'done' : 'error'
	} else {
		store.indicatorState = 'error'
	}
	renderIndicatorState(store)

	if (opts.showThanks && store.indicatorRoot && store.indicatorState === 'done') {
		showThanksScreen(store.indicatorRoot, {
			onSubmitNote: async text => {
				if (!store.sessionId) return
				store.endNote = text
				// Second finalise only carries the late-binding fields. mutedSegments
				// already landed on call 1, server stores idempotently, no need to
				// resend. Include any notes that arrived (or failed to ack) between
				// the two calls.
				const stillUnacked = store.notes.filter(n => !n.acked).map(n => ({ atMs: n.atMs, text: n.text }))
				const ok = await finaliseSession(store.options.apiUrl, store.sessionId, durationSeconds, {
					endNote: text,
					notes: stillUnacked,
					...replayLinkage,
				})
				if (!ok) throw new Error('finalise failed')
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
			const slug = getTestSlug(merged.queryParam)
			if (!slug) return

			const apiUrl = merged.apiUrl || ctx.baseUrl || DEFAULT_API_URL
			const store: RecorderStore = {
				cancelled: false,
				slug,
				sessionId: null,
				clientId: null,
				recorder: null,
				stream: null,
				chunkIndex: 0,
				uploadQueue: Promise.resolve(),
				pendingUploads: 0,
				startedAt: Date.now(),
				indicator: null,
				indicatorRoot: null,
				indicatorState: 'recording',
				pageHideHandler: null,
				options: { ...merged, apiUrl },
				tasks: [],
				tasksPanelOpen: readTasksPanelOpen(),
				outsidePointerHandler: null,
				keydownHandler: null,
				hasMicPermission: false,
				muted: false,
				mutedSinceMs: null,
				mutedSegments: [],
				muteToastShown: false,
				muteToastTimers: [],
				notes: [],
				notesPopoverOpen: false,
				notePopoverAtMs: null,
				endNote: '',
				finishFlowRan: false,
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
				if (!store.hasMicPermission) return
				const ok = toggleMute(store)
				if (!ok) return
				if (store.muted) showMuteToast(store)
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
				// Best-effort flush + finalise. We don't await here; the browser
				// is shutting the page down. `keepalive: true` on finalise lets
				// the request race the unload.
				void finishFlow(store, ctx, { showThanks: false })
			}
			store.pageHideHandler = pageHide
			window.addEventListener('pagehide', pageHide)

			void (async (): Promise<void> => {
				const created = await createSession(apiUrl, slug, readTesterName(merged.testerName))
				if (store.cancelled) return
				if (!created) {
					ctx.logger.error('failed to create user-test session')
					store.indicatorState = 'error'
					renderIndicatorState(store)
					return
				}
				store.sessionId = created.sessionId
				store.clientId = created.clientId
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
			if (store.indicator && store.indicator.parentNode) {
				store.indicator.parentNode.removeChild(store.indicator)
			}
			store.indicator = null
			store.indicatorRoot = null
		},
	}
}

// Internal helpers exposed for tests only. Not part of the public API.
export const __test__ = { getTestSlug, pickMimeType, isMediaRecorderSupported }
