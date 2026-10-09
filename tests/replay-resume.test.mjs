// App switch: a hidden tab flushes but keeps its recorder and session, so coming back continues the same
// recording with no restart and no new full snapshot. Only a real unload finalises.
//
// Run with: node --test tests/replay-resume.test.mjs

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

function makeElement(tag) {
	return {
		tagName: String(tag).toUpperCase(),
		children: [],
		style: {},
		setAttribute() {},
		appendChild(child) {
			this.children.push(child)
			return child
		},
		removeChild() {},
		remove() {},
		addEventListener() {},
		attachShadow() {
			return makeElement('shadow-root')
		},
		focus() {},
	}
}

const win = Object.assign(new EventTarget(), {
	sessionStorage: new MemoryStorage(),
	localStorage: new MemoryStorage(),
	location: { href: 'https://app.example/docs' },
	history: { pushState() {}, replaceState() {} },
})
const doc = Object.assign(new EventTarget(), {
	title: 'Docs',
	referrer: '',
	visibilityState: 'visible',
	body: makeElement('body'),
	createElement: makeElement,
})
Object.defineProperty(globalThis, 'window', { value: win, configurable: true, writable: true })
Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true })

// Idle callbacks run only when a test lets them, so record() can be shown to wait for idle.
let idleQueue = []
let autoIdle = true
globalThis.requestIdleCallback = cb => {
	if (autoIdle) setTimeout(cb, 0)
	else idleQueue.push(cb)
	return 0
}
const runIdle = () => {
	const queued = idleQueue
	idleQueue = []
	for (const cb of queued) cb()
}

let calls = []
let inFlight = 0
let nextId = 0
globalThis.fetch = async (url, init = {}) => {
	const href = String(url)
	calls.push({ url: href, method: init.method ?? 'GET', body: init.body, keepalive: init.keepalive === true })
	inFlight += 1
	await new Promise(resolve => setTimeout(resolve, 20))
	inFlight -= 1
	if (href.endsWith('/api/feedback')) {
		nextId += 1
		return Response.json({ success: true, feedbackId: `fb-${nextId}`, replayLinkToken: `token-${nextId}` })
	}
	if (href.endsWith('/api/replay-sessions')) return Response.json({ accepted: true, sessionReplayId: `replay-${++nextId}` })
	return Response.json({ ok: true })
}

const { createUseroFeedback } = await import('../dist/headless.js')
const { sessionReplay, __test__ } = await import('../dist-test/replay.js')

// Fake rrweb: record() emits Meta + FullSnapshot like a real start and keeps `emit` so tests can add events.
let recordCalls = 0
let stopCalls = 0
let forcedSnapshots = 0
let rrwebLoads = 0
let emit = null
__test__.setRrwebLoader(async () => {
	rrwebLoads += 1
	const record = opts => {
		recordCalls += 1
		emit = opts.emit
		const now = Date.now()
		opts.emit({ type: 4, data: { href: 'https://app.example/docs' }, timestamp: now })
		opts.emit({ type: 2, data: { node: { id: 1 } }, timestamp: now + 1 })
		return () => {
			stopCalls += 1
		}
	}
	record.takeFullSnapshot = () => {
		forcedSnapshots += 1
	}
	// Like rrweb: a Custom (type 5) event through the same emit, so it streams in the chunks.
	record.addCustomEvent = (tag, payload) => {
		markers.push({ tag, payload })
		emit?.({ type: 5, data: { tag, payload }, timestamp: Date.now() })
	}
	return record
})
let markers = []
const awayMarkers = () => markers.filter(m => m.tag.startsWith('usero:'))

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitFor(condition, ms = 3000) {
	const started = Date.now()
	while (!condition()) {
		if (Date.now() - started > ms) return false
		await delay(5)
	}
	return true
}

const isPost = c => c.method === 'POST'
const ambientCreates = () =>
	calls.filter(c => isPost(c) && c.url.endsWith('/api/replay-sessions') && !JSON.parse(c.body).snapshotOnly)
const snapshotCreates = () =>
	calls.filter(c => isPost(c) && c.url.endsWith('/api/replay-sessions') && JSON.parse(c.body).snapshotOnly)
const chunksFor = id => calls.filter(c => c.url.includes(`/api/replay-sessions/${id}/chunks/`))
const finalises = () => calls.filter(c => c.url.includes('/finalise'))
const feedbackPosts = () => calls.filter(c => isPost(c) && c.url.endsWith('/api/feedback'))

function hide() {
	doc.visibilityState = 'hidden'
	doc.dispatchEvent(new Event('visibilitychange'))
}
function show() {
	doc.visibilityState = 'visible'
	doc.dispatchEvent(new Event('visibilitychange'))
}
function pageTransition(type, persisted) {
	const event = new Event(type)
	Object.defineProperty(event, 'persisted', { value: persisted })
	win.dispatchEvent(event)
}
function userActs() {
	emit({ type: 3, data: { source: 2, type: 2, id: 1 }, timestamp: Date.now() })
}

beforeEach(async () => {
	let quietSince = Date.now()
	await waitFor(() => {
		if (inFlight > 0) quietSince = Date.now()
		return Date.now() - quietSince > 80
	})
	doc.visibilityState = 'visible'
	autoIdle = true
	idleQueue = []
	calls = []
	recordCalls = 0
	stopCalls = 0
	forcedSnapshots = 0
	rrwebLoads = 0
	emit = null
	markers = []
	globalThis.__useroSessionReplayActive__ = undefined
})

function setup(t, replayOptions) {
	const usero = createUseroFeedback({
		clientId: 'client_abc',
		plugins: [sessionReplay({ chunkSeconds: 0.05, ...replayOptions })],
	})
	t.after(() => usero.destroy())
	return usero
}

async function liveSessionId() {
	assert.ok(await waitFor(() => recordCalls === 1), 'recording live')
	return `replay-${nextId}`
}

test('hide flushes on keepalive but keeps the session; showing again continues it', async t => {
	setup(t, { recording: 'always' })
	const id = await liveSessionId()
	assert.ok(await waitFor(() => chunksFor(id).length > 0))
	userActs()
	hide()
	const flushed = chunksFor(id).at(-1)
	assert.equal(flushed.keepalive, true, 'buffered events left inside the hide handler')
	await delay(100)
	assert.equal(finalises().length, 0, 'not finalised on hide')
	assert.equal(stopCalls, 0, 'rrweb kept running')

	show()
	const before = chunksFor(id).length
	userActs()
	assert.ok(await waitFor(() => chunksFor(id).length > before), 'chunks continue in the same session')
	assert.equal(ambientCreates().length, 1, 'no new session')
	assert.equal(recordCalls, 1, 'no restart, so no new full snapshot')
})

test('hidden pauses the periodic flush; events wait in memory and go out on return', async t => {
	setup(t, { recording: 'always' })
	const id = await liveSessionId()
	assert.ok(await waitFor(() => chunksFor(id).length > 0))
	hide()
	await delay(30)
	const atHide = chunksFor(id).length
	for (let i = 0; i < 5; i += 1) userActs()
	await delay(300)
	assert.equal(chunksFor(id).length, atHide, 'no timer uploads while hidden (chunkSeconds is 50 ms here)')
	show()
	assert.ok(await waitFor(() => chunksFor(id).length === atHide + 1), 'the held events upload on return')
	userActs()
	assert.ok(await waitFor(() => chunksFor(id).length > atHide + 1), 'the periodic flush is running again')
})

test('a busy hidden tab still uploads once a batch reaches chunkMaxEvents, merged, never dropped', async t => {
	setup(t, { recording: 'always', chunkMaxEvents: 20 })
	const id = await liveSessionId()
	assert.ok(await waitFor(() => chunksFor(id).length > 0))
	hide()
	await delay(30)
	const atHide = chunksFor(id).length
	for (let i = 0; i < 45; i += 1) userActs()
	assert.ok(await waitFor(() => chunksFor(id).length >= atHide + 2), 'two full batches went out while hidden')
	const counts = chunksFor(id)
		.slice(atHide)
		.map(c => Number(new URL(c.url).searchParams.get('eventCount')))
	assert.equal(counts.reduce((a, b) => a + b, 0), 40, 'every event of the full batches, none dropped')
})

test('a submit after coming back links the same live session, not a snapshot', async t => {
	const usero = setup(t, { recording: 'always' })
	const id = await liveSessionId()
	hide()
	await delay(50)
	show()
	const result = await usero.submit({ rating: 2, comment: 'Back from the competitor app' })
	assert.equal(result.success, true)
	assert.equal(JSON.parse(feedbackPosts()[0].body).sessionReplayId, id)
	await delay(80)
	assert.equal(snapshotCreates().length, 0)
})

test('bfcache: pagehide persisted flushes only, pageshow carries on with the same recorder', async t => {
	const usero = setup(t, { recording: 'always' })
	const id = await liveSessionId()
	pageTransition('pagehide', true)
	await delay(50)
	assert.equal(finalises().length, 0)
	assert.equal(stopCalls, 0)
	pageTransition('pageshow', true)
	const result = await usero.submit({ rating: 4, comment: 'restored' })
	assert.equal(JSON.parse(feedbackPosts()[0].body).sessionReplayId, id)
	assert.equal(result.success, true)
	assert.equal(recordCalls, 1)
})

test('a real unload (pagehide, not persisted) still finalises and stops rrweb', async t => {
	setup(t, { recording: 'always' })
	const id = await liveSessionId()
	pageTransition('pagehide', false)
	assert.ok(await waitFor(() => finalises().length === 1))
	assert.ok(finalises()[0].url.includes(id))
	assert.equal(stopCalls, 1)
})

test('rapid hide and show flapping: one session, one recorder, nothing finalised', async t => {
	setup(t, { recording: 'always' })
	await liveSessionId()
	for (let i = 0; i < 8; i += 1) {
		hide()
		await delay(5)
		show()
		await delay(5)
	}
	await delay(150)
	assert.equal(ambientCreates().length, 1)
	assert.equal(recordCalls, 1)
	assert.equal(finalises().length, 0)
})

test('sampled out stays out across hide and show', async t => {
	setup(t, { recording: 'always', sampleRate: 0 })
	await delay(50)
	hide()
	show()
	await delay(150)
	assert.equal(ambientCreates().length, 0)
	assert.equal(rrwebLoads, 0)
})

for (const mode of ['never', 'ask']) {
	test(`'${mode}' stays off across hide and show`, async t => {
		setup(t, { recording: mode })
		await delay(50)
		hide()
		show()
		await delay(150)
		assert.equal(ambientCreates().length, 0)
		assert.equal(rrwebLoads, 0)
	})
}

test('marks time away with usero:hidden / usero:visible custom events, once per change', async t => {
	setup(t, { recording: 'always' })
	const id = await liveSessionId()
	assert.ok(await waitFor(() => chunksFor(id).length > 0 && inFlight === 0))
	hide()
	// The hidden marker rides in the chunk flushed by the hide handler.
	const flushed = chunksFor(id).at(-1)
	assert.ok(flushed.keepalive)
	assert.match(await new Response(flushed.body).text(), /"tag":"usero:hidden"/)
	pageTransition('pagehide', true)
	pageTransition('pageshow', true)
	show()
	assert.deepEqual(awayMarkers(), [
		{ tag: 'usero:hidden', payload: { reason: 'visibility' } },
		{ tag: 'usero:visible', payload: { reason: 'bfcache' } },
	])
})

test('bfcache pagehide and pageshow mark away on their own', async t => {
	setup(t, { recording: 'always' })
	await liveSessionId()
	pageTransition('pagehide', true)
	pageTransition('pageshow', true)
	pageTransition('pageshow', false)
	assert.deepEqual(awayMarkers(), [
		{ tag: 'usero:hidden', payload: { reason: 'bfcache' } },
		{ tag: 'usero:visible', payload: { reason: 'bfcache' } },
	])
})

test('record() waits for an idle callback', async t => {
	autoIdle = false
	setup(t, { recording: 'always' })
	assert.ok(await waitFor(() => ambientCreates().length === 1 && rrwebLoads === 1 && idleQueue.length > 0))
	assert.equal(recordCalls, 0, 'not started before idle')
	await delay(30)
	assert.equal(recordCalls, 0, 'still waiting')
	runIdle()
	assert.ok(await waitFor(() => recordCalls === 1), 'started once idle')
})

test('no forced full snapshot after record() or on a widget shadow update', async t => {
	setup(t, { recording: 'always' })
	await liveSessionId()
	win.dispatchEvent(new CustomEvent('usero:shadow-update', { detail: { reason: 'mount' } }))
	win.dispatchEvent(new CustomEvent('usero:shadow-update', { detail: { reason: 'panel-open' } }))
	await delay(30)
	assert.equal(forcedSnapshots, 0)
})
