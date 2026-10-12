// Tab switch during a user test: hiding the tab flushes and keeps recording, a mic the
// browser ended while hidden restarts on return, and a failed restart shows honestly.
//
// Run with: npm test (builds first; these import the built ESM from dist/).

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

class MemoryStorage {
	#m = new Map()
	getItem(k) {
		return this.#m.has(k) ? this.#m.get(k) : null
	}
	setItem(k, v) {
		this.#m.set(k, String(v))
	}
	removeItem(k) {
		this.#m.delete(k)
	}
}

class FakeTrack {
	readyState = 'live'
	muted = false
	enabled = true
	#listeners = new Map()
	addEventListener(type, fn) {
		const list = this.#listeners.get(type) ?? []
		list.push(fn)
		this.#listeners.set(type, list)
	}
	removeEventListener(type, fn) {
		this.#listeners.set(type, (this.#listeners.get(type) ?? []).filter(f => f !== fn))
	}
	fire(type) {
		for (const fn of this.#listeners.get(type) ?? []) fn()
	}
	stop() {
		this.readyState = 'ended'
	}
}

class FakeStream {
	constructor() {
		this.track = new FakeTrack()
	}
	getAudioTracks() {
		return [this.track]
	}
	getTracks() {
		return [this.track]
	}
}

const recorders = []
class FakeMediaRecorder {
	static isTypeSupported() {
		return true
	}
	state = 'inactive'
	#listeners = new Map()
	constructor(stream) {
		this.stream = stream
		recorders.push(this)
	}
	addEventListener(type, fn) {
		const list = this.#listeners.get(type) ?? []
		list.push(fn)
		this.#listeners.set(type, list)
	}
	#emit(type, event) {
		for (const fn of this.#listeners.get(type) ?? []) fn(event)
	}
	start() {
		this.state = 'recording'
	}
	requestData() {
		if (this.state === 'inactive') throw new Error('InvalidStateError')
		this.#emit('dataavailable', { data: new Blob(['opus-bytes'], { type: 'audio/webm' }) })
	}
	stop() {
		if (this.state === 'inactive') return
		this.state = 'inactive'
		this.#emit('stop', {})
	}
	pause() {
		this.state = 'paused'
	}
	resume() {
		this.state = 'recording'
	}
}

let gumCalls = 0
let gumBehaviour = () => Promise.resolve(new FakeStream())
const beacons = []
const fetches = []
const localStorage = new MemoryStorage()

globalThis.window = {
	localStorage,
	MediaRecorder: FakeMediaRecorder,
	setTimeout,
	clearTimeout,
}
globalThis.MediaRecorder = FakeMediaRecorder
Object.defineProperty(globalThis, 'navigator', {
	configurable: true,
	writable: true,
	value: {
		mediaDevices: {
			getUserMedia: () => {
				gumCalls += 1
				return gumBehaviour()
			},
		},
		sendBeacon: (url, blob) => {
			beacons.push({ url, blob })
			return true
		},
	},
})
globalThis.fetch = async (url, init) => {
	fetches.push({ url, init })
	return { ok: true, status: 200, json: async () => ({}) }
}

const { __test__ } = await import('../dist/plugins/user-test.js')
const {
	onPageHidden,
	onPageVisible,
	pauseFlow,
	needsMicRestart,
	persistStatus,
	micFailReasonFromError,
	micChipState,
	readActiveSession,
	ACTIVE_SESSION_STORAGE_KEY,
	micStart: startRecording,
	flushMuteIfActive,
	onlyMicMuted,
} = __test__

const logger = { info() {}, warn() {}, error() {}, debug() {} }
const ctx = { logger }

function makeStore(overrides = {}) {
	return {
		cancelled: false,
		slug: 'checkout',
		sessionId: 'sess1',
		clientId: 'client1',
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
		pageShowHandler: null,
		visibilityHandler: null,
		options: { queryParam: 'usero_test', chunkSeconds: 5, apiUrl: 'https://usero.test', testerName: '', hideIndicator: true },
		tasks: [],
		tasksPanelOpen: false,
		outsidePointerHandler: null,
		keydownHandler: null,
		keyboardWatcherCleanup: null,
		hasMicPermission: false,
		micAcquiring: true,
		micFailReason: null,
		muted: false,
		mutedSinceMs: null,
		mutedSegments: [],
		micSilent: false,
		silenceMonitor: null,
		micWatcherCleanup: null,
		lastMicReacquireAt: 0,
		muteToastShown: false,
		muteToastTimers: [],
		resumeToastTimers: [],
		notes: [],
		notesPopoverOpen: false,
		notePopoverAtMs: null,
		endNote: '',
		finishFlowRan: false,
		sessionClosed: false,
		onSessionClosed: null,
		paused: false,
		unloading: false,
		hidden: false,
		hideFlushPending: false,
		resumed: false,
		sdkSessionId: null,
		audioStartedAt: null,
		replayStartedAt: null,
		freshStart: true,
		...overrides,
	}
}

// Minimal shadow-root stand-in: just the elements renderIndicatorState writes to.
function fakeRoot() {
	const el = () => {
		const attrs = new Map()
		return {
			textContent: '',
			innerHTML: '',
			disabled: false,
			setAttribute: (k, v) => attrs.set(k, v),
			removeAttribute: k => attrs.delete(k),
			getAttribute: k => attrs.get(k) ?? null,
		}
	}
	const parts = { '.dot': el(), '.mic': el(), '.mic-icon': el(), '.mic-label': el(), '.finish-btn': el() }
	globalThis.HTMLElement = Object
	return { parts, querySelector: sel => parts[sel] ?? null }
}

async function startLive(store) {
	await startRecording(store, ctx)
	assert.equal(store.recorder?.state, 'recording')
	return store.recorder
}

beforeEach(() => {
	gumCalls = 0
	gumBehaviour = () => Promise.resolve(new FakeStream())
	beacons.length = 0
	fetches.length = 0
	recorders.length = 0
	localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY)
})

test('hide flushes the buffered audio by beacon and keeps the recorder and mic running', async () => {
	const store = makeStore()
	const recorder = await startLive(store)
	const track = store.stream.track
	onPageHidden(store)
	assert.equal(store.hidden, true)
	assert.equal(recorder.state, 'recording', 'recorder must not stop on hide')
	assert.equal(track.readyState, 'live', 'mic track must not stop on hide')
	assert.equal(beacons.length, 1, 'the hide flush goes by beacon')
	assert.match(beacons[0].url, /chunk\?index=0$/)
	assert.equal(store.chunkIndex, 1)
	const persisted = readActiveSession()
	assert.equal(persisted.status, 'paused', 'a tab killed while hidden keeps the idle gate')
	assert.equal(typeof persisted.pausedAt, 'number')
	assert.equal(micChipState(store), 'recording')
})

test('chunks recorded while hidden go through the normal upload queue, not the beacon', async () => {
	const store = makeStore()
	const recorder = await startLive(store)
	onPageHidden(store)
	recorder.requestData()
	await store.uploadQueue
	assert.equal(beacons.length, 1)
	assert.equal(fetches.length, 1)
	assert.match(fetches[0].url, /chunk\?index=1$/)
	assert.equal(persistStatus(store), 'paused')
})

test('show after a hide with a live mic does no work: same recorder, no new getUserMedia', async () => {
	const store = makeStore()
	const recorder = await startLive(store)
	onPageHidden(store)
	await onPageVisible(store, ctx)
	assert.equal(gumCalls, 1, 'no second mic request')
	assert.equal(store.recorder, recorder)
	assert.equal(recorder.state, 'recording')
	assert.equal(store.hidden, false)
	assert.equal(readActiveSession().status, 'active')
	assert.equal(micChipState(store), 'recording')
})

test('a track the browser ended while hidden is restarted on show, continuing the chunk index', async () => {
	const store = makeStore()
	const first = await startLive(store)
	onPageHidden(store)
	store.stream.track.stop()
	await onPageVisible(store, ctx)
	assert.equal(gumCalls, 2, 'mic re-acquired once')
	assert.notEqual(store.recorder, first)
	assert.equal(store.recorder.state, 'recording')
	assert.equal(first.state, 'inactive', 'the old recorder is stopped, never two at once')
	assert.ok(store.chunkIndex >= 1, 'index continues from the pre-hide leg')
	assert.equal(store.indicatorState, 'recording')
	assert.equal(micChipState(store), 'recording')
	assert.equal(store.resumed, false, 'the resumed toast flag is consumed')
})

test('a recorder the browser stopped while hidden (iOS) is restarted on show', async () => {
	const store = makeStore()
	const first = await startLive(store)
	onPageHidden(store)
	first.stop()
	await onPageVisible(store, ctx)
	assert.equal(gumCalls, 2)
	assert.equal(store.recorder.state, 'recording')
})

test('a track still muted after the grace period on return is restarted', async () => {
	const store = makeStore()
	await startLive(store)
	onPageHidden(store)
	store.stream.track.muted = true
	await onPageVisible(store, ctx)
	assert.equal(gumCalls, 2)
})

test('a track muted only for a moment on return (iOS) unmutes without a restart or toast', async () => {
	const store = makeStore()
	const recorder = await startLive(store)
	onPageHidden(store)
	const track = store.stream.track
	track.muted = true
	const pending = onPageVisible(store, ctx)
	await new Promise(resolve => setTimeout(resolve, 20))
	track.muted = false
	track.fire('unmute')
	await pending
	assert.equal(gumCalls, 1, 'no mic restart')
	assert.equal(store.recorder, recorder)
	assert.equal(store.resumed, false, 'no resumed toast')
	assert.equal(readActiveSession().status, 'active')
})

test('a paused recorder on return is resumed without a new mic request', async () => {
	const store = makeStore()
	const recorder = await startLive(store)
	onPageHidden(store)
	recorder.pause()
	await onPageVisible(store, ctx)
	assert.equal(gumCalls, 1)
	assert.equal(recorder.state, 'recording')
})

test('the mic watcher does not re-acquire while hidden; the show handler does it once', async () => {
	const store = makeStore()
	await startLive(store)
	onPageHidden(store)
	store.stream.track.muted = true
	store.stream.track.fire('mute')
	assert.equal(gumCalls, 1, 'no re-acquire while hidden')
	await onPageVisible(store, ctx)
	assert.equal(gumCalls, 2)
})

test('permission denied on restart shows the honest blocked state, and tapping retry recovers', async () => {
	const store = makeStore()
	await startLive(store)
	onPageHidden(store)
	store.stream.track.stop()
	gumBehaviour = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
	const root = fakeRoot()
	store.indicatorRoot = root
	await onPageVisible(store, ctx)
	assert.equal(store.recorder, null)
	assert.equal(store.hasMicPermission, false)
	assert.equal(store.indicatorState, 'no-audio')
	assert.equal(micChipState(store), 'none')
	assert.equal(root.parts['.mic-label'].textContent, 'Mic blocked, tap to retry')
	assert.equal(root.parts['.dot'].getAttribute('data-state'), 'no-audio')
	gumBehaviour = () => Promise.resolve(new FakeStream())
	await startRecording(store, ctx)
	assert.equal(micChipState(store), 'recording')
	assert.equal(store.indicatorState, 'recording')
	assert.equal(root.parts['.mic-label'].textContent, 'Recording')
})

test('a mic that will not restart (in use) shows "Mic stopped, tap to resume"', async () => {
	const store = makeStore()
	await startLive(store)
	onPageHidden(store)
	store.stream.track.stop()
	gumBehaviour = () => Promise.reject(Object.assign(new Error('busy'), { name: 'NotReadableError' }))
	const root = fakeRoot()
	store.indicatorRoot = root
	await onPageVisible(store, ctx)
	assert.equal(store.micFailReason, 'stopped')
	assert.equal(micChipState(store), 'none')
	assert.equal(root.parts['.mic-label'].textContent, 'Mic stopped, tap to resume')
	assert.equal(root.parts['.mic'].getAttribute('data-mic-fail'), 'stopped')
})

test('the chip reads "Connecting mic" during a restart, never "Recording"', async () => {
	const store = makeStore()
	await startLive(store)
	onPageHidden(store)
	store.stream.track.stop()
	let release
	gumBehaviour = () => new Promise(resolve => { release = () => resolve(new FakeStream()) })
	const pending = onPageVisible(store, ctx)
	assert.equal(micChipState(store), 'connecting')
	release()
	await pending
	assert.equal(micChipState(store), 'recording')
})

test('a participant who muted stays muted after a restart', async () => {
	const store = makeStore()
	await startLive(store)
	store.muted = true
	store.stream.track.enabled = false
	onPageHidden(store)
	store.stream.track.stop()
	await onPageVisible(store, ctx)
	assert.equal(gumCalls, 2)
	assert.equal(store.stream.track.enabled, false)
	assert.equal(micChipState(store), 'muted')
})

test('a mic that had already failed before the hide is left alone on show', async () => {
	gumBehaviour = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
	const store = makeStore()
	await startRecording(store, ctx)
	assert.equal(micChipState(store), 'none')
	onPageHidden(store)
	await onPageVisible(store, ctx)
	assert.equal(gumCalls, 1, 'no surprise prompt on return')
	assert.equal(micChipState(store), 'none')
})

test('back-forward cache: a blocked or missing mic is not re-prompted on restore', async () => {
	for (const name of ['NotAllowedError', 'NotFoundError']) {
		gumCalls = 0
		gumBehaviour = () => Promise.reject(Object.assign(new Error(name), { name }))
		const store = makeStore()
		await startRecording(store, ctx)
		assert.equal(micChipState(store), 'none')
		pauseFlow(store)
		assert.equal(store.paused, true)
		await onPageVisible(store, ctx)
		assert.equal(gumCalls, 1, `no surprise prompt after a bfcache restore (${name})`)
		assert.equal(store.paused, false)
		assert.equal(micChipState(store), 'none')
	}
})

test('back-forward cache: pagehide pauses, a persisted pageshow restarts the mic', async () => {
	const store = makeStore()
	const first = await startLive(store)
	pauseFlow(store)
	assert.equal(first.state, 'inactive')
	assert.equal(store.paused, true)
	await onPageVisible(store, ctx)
	assert.equal(store.paused, false)
	assert.equal(store.unloading, false)
	assert.equal(gumCalls, 2)
	assert.equal(store.recorder.state, 'recording')
})

test('back-forward cache: muted time after the restore is recorded as muted', async () => {
	const store = makeStore({ startedAt: Date.now() - 10_000 })
	await startLive(store)
	store.muted = true
	store.mutedSinceMs = 2_000
	store.stream.track.enabled = false
	pauseFlow(store)
	assert.equal(store.mutedSegments.length, 1, 'pauseFlow closes the segment before the restore')
	assert.equal(store.mutedSinceMs, null)
	await onPageVisible(store, ctx)
	assert.equal(store.muted, true)
	assert.equal(typeof store.mutedSinceMs, 'number', 'the restored leg opens a new muted segment')
	assert.ok(store.mutedSinceMs >= 10_000)
	store.startedAt -= 3_000
	flushMuteIfActive(store)
	assert.equal(store.mutedSegments.length, 2)
	assert.ok(store.mutedSegments[1].endMs > store.mutedSegments[1].startMs)
})

test('a restart while muted keeps the open muted segment start', async () => {
	const store = makeStore({ startedAt: Date.now() - 10_000 })
	await startLive(store)
	store.muted = true
	store.mutedSinceMs = 2_000
	await startRecording(store, ctx)
	assert.equal(store.mutedSinceMs, 2_000)
})

test('nothing restarts after Finish or a server close', async () => {
	const store = makeStore()
	await startLive(store)
	onPageHidden(store)
	store.stream.track.stop()
	store.finishFlowRan = true
	await onPageVisible(store, ctx)
	assert.equal(gumCalls, 1)
	const closed = makeStore({ sessionClosed: true })
	onPageHidden(closed)
	await onPageVisible(closed, ctx)
	assert.equal(gumCalls, 1)
})

test('needsMicRestart', () => {
	const live = { readyState: 'live', muted: false }
	assert.equal(needsMicRestart('recording', [live]), false)
	assert.equal(needsMicRestart('paused', [live]), false)
	assert.equal(needsMicRestart('inactive', [live]), true)
	assert.equal(needsMicRestart(null, [live]), true)
	assert.equal(needsMicRestart('recording', []), true)
	assert.equal(needsMicRestart('recording', [{ readyState: 'ended', muted: false }]), true)
	assert.equal(needsMicRestart('recording', [{ readyState: 'live', muted: true }]), true)
	assert.equal(onlyMicMuted('recording', [{ readyState: 'live', muted: true }]), true)
	assert.equal(onlyMicMuted('recording', [{ readyState: 'ended', muted: true }]), false)
	assert.equal(onlyMicMuted('inactive', [{ readyState: 'live', muted: true }]), false)
	assert.equal(onlyMicMuted('recording', [live]), false)
})

test('micFailReasonFromError', () => {
	const err = name => Object.assign(new Error(name), { name })
	assert.equal(micFailReasonFromError(err('NotAllowedError')), 'blocked')
	assert.equal(micFailReasonFromError(err('SecurityError')), 'blocked')
	assert.equal(micFailReasonFromError(err('NotFoundError')), 'not-found')
	assert.equal(micFailReasonFromError(err('NotReadableError')), 'stopped')
	assert.equal(micFailReasonFromError(err('AbortError')), 'stopped')
	assert.equal(micFailReasonFromError('weird'), 'blocked')
})
