// Submit critical path guard: with every request taking ~300 ms, the
// feedback POST must leave first, with nothing awaited before it, in every
// recording mode, and the replay must still end up linked afterwards.
//
// Run with: node --test tests/submit-critical-path.test.mjs
//
// Runs the real headless controller + sessionReplay plugin from dist. No
// jsdom: window/document are stubs and rrweb is swapped for a fake recorder.

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const LATENCY_MS = 300
// Well under one request's latency: anything awaited before the POST blows it.
const MAX_SUBMIT_TO_POST_MS = 60

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

let createdElements = []
function makeElement(tag) {
	const el = {
		tagName: String(tag).toUpperCase(),
		children: [],
		listeners: {},
		style: {},
		textContent: '',
		parentNode: null,
		setAttribute() {},
		appendChild(child) {
			this.children.push(child)
			child.parentNode = this
			return child
		},
		removeChild(child) {
			this.children = this.children.filter(c => c !== child)
		},
		remove() {
			if (this.parentNode) this.parentNode.removeChild(this)
		},
		addEventListener(type, fn) {
			this.listeners[type] = [...(this.listeners[type] ?? []), fn]
		},
		attachShadow() {
			return makeElement('shadow-root')
		},
		focus() {},
		click() {
			for (const fn of this.listeners.click ?? []) fn()
		},
	}
	createdElements.push(el)
	return el
}

Object.defineProperty(globalThis, 'window', {
	value: {
		sessionStorage: new MemoryStorage(),
		localStorage: new MemoryStorage(),
		location: { href: 'https://app.example/checkout' },
		history: { pushState() {}, replaceState() {} },
		addEventListener() {},
		removeEventListener() {},
		dispatchEvent: () => true,
	},
	configurable: true,
	writable: true,
})
Object.defineProperty(globalThis, 'document', {
	value: {
		title: 'Checkout',
		referrer: '',
		visibilityState: 'visible',
		body: makeElement('body'),
		createElement: makeElement,
		addEventListener() {},
		removeEventListener() {},
	},
	configurable: true,
	writable: true,
})

// Every request takes LATENCY_MS. `startedAt` is when the SDK called fetch.
let calls = []
let inFlight = 0
let serverMode = 'always'
let nextId = 0
globalThis.fetch = async (url, init = {}) => {
	const href = String(url)
	const call = { url: href, method: init.method ?? 'GET', body: init.body, startedAt: performance.now() }
	calls.push(call)
	inFlight += 1
	await new Promise(resolve => setTimeout(resolve, LATENCY_MS))
	inFlight -= 1
	if (href.includes('/api/feedback?')) {
		return Response.json({ valid: true, settings: { sessionContext: serverMode } })
	}
	if (href.endsWith('/api/feedback')) {
		nextId += 1
		return Response.json({ success: true, feedbackId: `fb-${nextId}`, replayLinkToken: `token-fb-${nextId}` })
	}
	if (href.endsWith('/api/replay-sessions')) {
		nextId += 1
		return Response.json({ accepted: true, sessionReplayId: `replay-${nextId}` })
	}
	return Response.json({ ok: true })
}

const { createUseroFeedback } = await import('../dist/headless.js')
const { sessionReplay, __test__ } = await import('../dist-test/replay.js')

__test__.setRrwebLoader(async () => {
	const record = opts => {
		const now = Date.now()
		opts.emit({ type: 4, data: { href: 'https://app.example/checkout' }, timestamp: now })
		opts.emit({ type: 2, data: { node: { id: 1 } }, timestamp: now + 1 })
		return () => {}
	}
	record.takeFullSnapshot = () => {}
	record.addCustomEvent = () => {}
	return record
})

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitFor(condition, ms = 5000) {
	const started = Date.now()
	while (!condition()) {
		if (Date.now() - started > ms) return false
		await delay(10)
	}
	return true
}

const feedbackPosts = () => calls.filter(c => c.method === 'POST' && c.url.endsWith('/api/feedback'))
const snapshotCreates = () =>
	calls.filter(
		c => c.method === 'POST' && c.url.endsWith('/api/replay-sessions') && JSON.parse(c.body).snapshotOnly,
	)

beforeEach(async () => {
	// Background traffic from the previous test must not leak into this one. The snapshot chunk starts after
	// an async gzip once the create lands, so wait for the network to stay quiet, not just to hit zero once.
	let quietSince = Date.now()
	await waitFor(() => {
		if (inFlight > 0) quietSince = Date.now()
		return Date.now() - quietSince > 150
	})
	calls = []
	createdElements = []
	globalThis.__useroSessionReplayActive__ = undefined
})

// Controller torn down after the test, pass or fail, so no recorder outlives it.
function setup(t, replayOptions) {
	const usero = createUseroFeedback({ clientId: 'client_abc', plugins: [sessionReplay(replayOptions)] })
	t.after(() => usero.destroy())
	return usero
}

// Submits and asserts the POST left first and immediately. Returns its body.
async function submitAndCheckCriticalPath(usero) {
	// Let init kick off its own requests first; those run alongside the submit, they don't gate it.
	await delay(0)
	const submitAt = performance.now()
	const resultPromise = usero.submit({ rating: 2, comment: 'Checkout button does nothing' })
	assert.ok(await waitFor(() => feedbackPosts().length === 1), 'feedback POST sent')
	const post = feedbackPosts()[0]
	const before = calls.filter(c => c.startedAt >= submitAt && c.startedAt < post.startedAt)
	assert.deepEqual(before.map(c => c.url), [], 'no request was started, let alone awaited, before the POST')
	assert.ok(
		post.startedAt - submitAt < MAX_SUBMIT_TO_POST_MS,
		`POST left ${Math.round(post.startedAt - submitAt)} ms after submit`,
	)
	const result = await resultPromise
	assert.equal(result.success, true)
	return { body: JSON.parse(post.body), feedbackId: result.data.feedbackId }
}

test('always, recording live: POST first, carries the live session id', async t => {
	const usero = setup(t, { recording: 'always' })
	assert.ok(await waitFor(() => calls.some(c => c.url.endsWith('/api/replay-sessions'))))
	await delay(LATENCY_MS + 50)
	const { body } = await submitAndCheckCriticalPath(usero)
	assert.match(body.sessionReplayId, /^replay-/, 'linked in the POST itself')
	await delay(50)
	assert.equal(snapshotCreates().length, 0, 'no redundant snapshot')
})

test('always, no recording live: POST first, snapshot linked afterwards', async t => {
	const usero = setup(t, { recording: 'always', sampleRate: 0 })
	const { body, feedbackId } = await submitAndCheckCriticalPath(usero)
	assert.equal(body.sessionReplayId, undefined)
	assert.ok(await waitFor(() => snapshotCreates().length === 1), 'snapshot session created')
	assert.equal(JSON.parse(snapshotCreates()[0].body).feedbackId, feedbackId, 'create carries the link')
	assert.equal(JSON.parse(snapshotCreates()[0].body).linkToken, `token-${feedbackId}`, 'and the link token')
})

test('always, recording still starting: POST first, snapshot linked afterwards', async t => {
	const usero = setup(t, { recording: 'always' })
	// The ambient session create is in flight (300 ms), so no live id yet.
	const { feedbackId } = await submitAndCheckCriticalPath(usero)
	assert.ok(await waitFor(() => snapshotCreates().length === 1))
	assert.equal(JSON.parse(snapshotCreates()[0].body).feedbackId, feedbackId)
})

test('mode from the server, fetch still in flight at submit: POST first', async t => {
	serverMode = 'always'
	const usero = setup(t, { sampleRate: 0 })
	const { feedbackId } = await submitAndCheckCriticalPath(usero)
	assert.ok(await waitFor(() => snapshotCreates().length === 1))
	assert.equal(JSON.parse(snapshotCreates()[0].body).feedbackId, feedbackId)
})

test('ask, accepted: POST first, prompt after, consented snapshot linked', async t => {
	const usero = setup(t, { recording: 'ask' })
	const { feedbackId } = await submitAndCheckCriticalPath(usero)
	const include = () => createdElements.find(el => el.tagName === 'BUTTON' && el.textContent === 'Include')
	assert.ok(await waitFor(() => include() !== undefined), 'prompt shown after the feedback landed')
	include().click()
	assert.ok(await waitFor(() => snapshotCreates().length === 1))
	const createBody = JSON.parse(snapshotCreates()[0].body)
	assert.equal(createBody.feedbackId, feedbackId)
	assert.equal(createBody.consented, true)
})

test('never: POST first and nothing else', async t => {
	const usero = setup(t, { recording: 'never' })
	await submitAndCheckCriticalPath(usero)
	await delay(LATENCY_MS)
	assert.deepEqual(
		calls.map(c => c.url).filter(u => !u.endsWith('/api/feedback') && !u.includes('/api/identify')),
		[],
	)
})
