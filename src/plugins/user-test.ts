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

function buildIndicator(host: HTMLElement, store: RecorderStore, onFinish: () => void, onToggleTasks: () => void): ShadowRoot {
	const root = host.attachShadow({ mode: 'closed' })
	const style = document.createElement('style')
	// Keep this CSS small. Pulse is the only animation. Bottom-center,
	// safe-area aware, semi-transparent so it doesn't block the page.
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
			display: inline-flex; align-items: center; gap: 10px;
			padding: 8px 14px 8px 12px;
			background: rgba(17,17,17,0.78);
			border-radius: 999px;
			box-shadow: 0 8px 24px rgba(0,0,0,0.18);
			backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
			max-width: 100%;
		}
		.panel {
			background: rgba(17,17,17,0.88);
			border-radius: 14px; padding: 12px 14px 12px 8px;
			line-height: 1.45;
			box-shadow: 0 12px 32px rgba(0,0,0,0.28);
			max-height: min(60vh, 480px);
			max-width: min(420px, calc(100vw - 32px));
			width: max-content; overflow-y: auto;
		}
		.panel[hidden] { display: none; }
		.panel ol { margin: 0; padding-left: 26px; }
		.panel li { margin: 0 0 8px; }
		.panel li:last-child { margin: 0; }
		.dot {
			width: 8px; height: 8px; border-radius: 50%;
			background: #ef4444;
			box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.6);
			animation: pulse 1.6s ease-out infinite;
		}
		.dot[data-state="no-audio"] { background: #fbbf24; animation: none; }
		.dot[data-state="finishing"] { background: #fbbf24; animation: none; }
		.dot[data-state="done"] { background: #10b981; animation: none; }
		.dot[data-state="error"] { background: #ef4444; animation: none; }
		.label { font-weight: 500; letter-spacing: 0.01em; }
		.spacer { width: 1px; height: 16px; background: rgba(255,255,255,0.18); margin: 0 2px; }
		.btn {
			appearance: none; border: 0; background: rgba(255,255,255,0.12);
			color: #fff; font: inherit; font-weight: 600;
			padding: 6px 12px; border-radius: 999px; cursor: pointer;
			transition: background 0.15s ease;
		}
		.btn:hover { background: rgba(255,255,255,0.22); }
		.btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
		.btn[disabled] { opacity: 0.5; cursor: progress; }
		.tasks-btn[aria-expanded="true"] { background: rgba(255,255,255,0.24); }
		@media (max-width: 420px) { .btn { padding: 9px 14px; min-height: 40px; } }
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
			border-radius: 16px; padding: 28px 24px;
			max-width: 360px; width: 100%;
			box-shadow: 0 20px 50px rgba(0,0,0,0.25);
		}
		.thanks h2 { margin: 0 0 8px; font-size: 20px; }
		.thanks p { margin: 0; font-size: 14px; line-height: 1.45; color: #4b5563; }
		.thanks .check {
			width: 44px; height: 44px; border-radius: 50%;
			background: #10b981; color: #fff;
			display: grid; place-items: center;
			margin: 0 auto 12px;
			font-size: 22px;
		}
		@keyframes pulse {
			0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.55); }
			70% { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
			100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
		}
		@media (prefers-reduced-motion: reduce) {
			.dot { animation: none; }
		}
	`
	const anchor = document.createElement('div')
	anchor.className = 'anchor'

	const panel = document.createElement('div')
	panel.className = 'panel'
	panel.hidden = true

	const bar = document.createElement('div')
	bar.className = 'bar'
	bar.setAttribute('role', 'status')
	bar.setAttribute('aria-live', 'polite')

	const dot = document.createElement('span')
	dot.className = 'dot'
	dot.setAttribute('data-state', store.indicatorState)

	const label = document.createElement('span')
	label.className = 'label'
	label.textContent = 'Recording'

	const spacer = document.createElement('span')
	spacer.className = 'spacer'

	bar.appendChild(dot)
	bar.appendChild(label)
	bar.appendChild(spacer)

	const btn = document.createElement('button')
	btn.type = 'button'
	btn.className = 'btn finish-btn'
	btn.textContent = 'Finish'
	btn.addEventListener('click', onFinish)
	bar.appendChild(btn)

	if (store.tasks.length > 0) installTasksToggle(bar, btn, store, onToggleTasks)

	anchor.appendChild(panel)
	anchor.appendChild(bar)

	root.appendChild(style)
	root.appendChild(anchor)
	return root
}

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

function renderIndicatorState(store: RecorderStore): void {
	const root = store.indicatorRoot
	if (!root) return
	const dot = root.querySelector('.dot')
	const label = root.querySelector('.label')
	const btn = root.querySelector<HTMLButtonElement>('.btn')
	if (!(dot instanceof HTMLElement) || !(label instanceof HTMLElement) || !btn) return
	dot.setAttribute('data-state', store.indicatorState)
	switch (store.indicatorState) {
		case 'recording':
			label.textContent = 'Recording'
			btn.textContent = 'Finish'
			btn.disabled = false
			break
		case 'no-audio':
			label.textContent = 'No mic, replay only'
			btn.textContent = 'Finish'
			btn.disabled = false
			break
		case 'finishing':
			label.textContent = 'Saving'
			btn.textContent = 'Saving'
			btn.disabled = true
			break
		case 'done':
			label.textContent = 'Saved'
			btn.textContent = 'Done'
			btn.disabled = true
			break
		case 'error':
			label.textContent = 'Save failed'
			btn.textContent = 'Retry'
			btn.disabled = false
			break
	}
}

function showThanksScreen(root: ShadowRoot): void {
	const overlay = document.createElement('div')
	overlay.className = 'thanks'
	overlay.innerHTML = `
		<div class="thanks-card">
			<div class="check" aria-hidden="true">&#10003;</div>
			<h2>Thanks for testing</h2>
			<p>Your session was saved. You can close this tab.</p>
		</div>
	`
	root.appendChild(overlay)
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

async function finaliseSession(
	apiUrl: string,
	sessionId: string,
	durationSeconds: number,
): Promise<boolean> {
	try {
		const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/user-test-sessions/${encodeURIComponent(sessionId)}/finalise`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ durationSeconds: Math.max(0, Math.round(durationSeconds)) }),
			keepalive: true,
		})
		return res.ok
	} catch {
		return false
	}
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
	if (store.indicatorState === 'finishing' || store.indicatorState === 'done') return
	store.indicatorState = 'finishing'
	renderIndicatorState(store)

	stopRecording(store)
	// Wait for the queued uploads to drain. Each upload already has its own
	// retry/backoff; this just lets them finish before finalise fires.
	await store.uploadQueue
	await flushPendingFromIdb(store, ctx)

	const durationSeconds = (Date.now() - store.startedAt) / 1000
	if (store.sessionId) {
		const ok = await finaliseSession(store.options.apiUrl, store.sessionId, durationSeconds)
		store.indicatorState = ok ? 'done' : 'error'
	} else {
		store.indicatorState = 'error'
	}
	renderIndicatorState(store)

	if (opts.showThanks && store.indicatorRoot && store.indicatorState === 'done') {
		showThanksScreen(store.indicatorRoot)
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

			if (!merged.hideIndicator) {
				const host = document.createElement('div')
				host.setAttribute('data-usero-user-test', 'true')
				document.body.appendChild(host)
				store.indicator = host
				store.indicatorRoot = buildIndicator(host, store, onFinish, onToggleTasks)
				renderIndicatorState(store)
			}

			// Outside-click + Escape close the tasks panel. Listen on document
			// (composedPath checks shadow ancestry so taps on the panel/pill
			// itself don't dismiss).
			const outsidePointer = (event: PointerEvent): void => {
				if (!store.tasksPanelOpen) return
				const host = store.indicator
				if (!host) return
				const path = event.composedPath()
				if (!path.includes(host)) setPanelOpen(false)
			}
			const onKeydown = (event: KeyboardEvent): void => {
				if (event.key === 'Escape' && store.tasksPanelOpen) setPanelOpen(false)
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
