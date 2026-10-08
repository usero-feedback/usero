// Session-context consent: the mode fetch, the three modes, and the
// submit-time page snapshot.
//
// Run with: node --test tests/session-context.test.mjs
//
// Covers the honest inversion we are shipping: consent is asked BEFORE
// anything is captured, so a decline means the snapshot never exists and
// nothing about the page reaches the network. The strongest assertion in
// here is the negative one: on decline, the rrweb loader is never invoked
// and no request is made.
//
// No jsdom. window/document are in-memory stubs, fetch is recorded, and
// rrweb is swapped out via the `__test__.setRrwebLoader` seam (rrweb needs
// a real DOM it will not get here).

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

// Every element the fake document has ever made, so tests can find the
// consent buttons by their label and click them.
let createdElements = []

function makeElement(tag) {
	const el = {
		tagName: String(tag).toUpperCase(),
		children: [],
		attributes: {},
		listeners: {},
		style: {},
		className: '',
		textContent: '',
		type: '',
		parentNode: null,
		shadowRoot: null,
		setAttribute(k, v) {
			this.attributes[k] = String(v)
		},
		getAttribute(k) {
			return k in this.attributes ? this.attributes[k] : null
		},
		removeAttribute(k) {
			delete this.attributes[k]
		},
		appendChild(child) {
			this.children.push(child)
			child.parentNode = this
			return child
		},
		removeChild(child) {
			this.children = this.children.filter(c => c !== child)
			if (child.parentNode === this) child.parentNode = null
		},
		remove() {
			if (this.parentNode) this.parentNode.removeChild(this)
		},
		addEventListener(type, fn) {
			this.listeners[type] = this.listeners[type] ?? []
			this.listeners[type].push(fn)
		},
		removeEventListener(type, fn) {
			this.listeners[type] = (this.listeners[type] ?? []).filter(f => f !== fn)
		},
		attachShadow() {
			this.shadowRoot = makeElement('shadow-root')
			return this.shadowRoot
		},
		focus() {},
		click() {
			for (const fn of this.listeners.click ?? []) fn()
		},
	}
	createdElements.push(el)
	return el
}

const sessionStorage = new MemoryStorage()
const localStorage = new MemoryStorage()
const body = makeElement('body')

Object.defineProperty(globalThis, 'window', {
	value: {
		sessionStorage,
		localStorage,
		location: { href: 'https://app.example/checkout' },
		history: { pushState() {}, replaceState() {} },
		addEventListener() {},
		removeEventListener() {},
	},
	configurable: true,
	writable: true,
})
// Document-level listeners are captured so tests can dispatch Escape at
// the consent prompt.
const documentListeners = {}
Object.defineProperty(globalThis, 'document', {
	value: {
		visibilityState: 'visible',
		title: 'Checkout',
		referrer: '',
		body,
		createElement: makeElement,
		addEventListener(type, fn) {
			documentListeners[type] = documentListeners[type] ?? []
			documentListeners[type].push(fn)
		},
		removeEventListener(type, fn) {
			documentListeners[type] = (documentListeners[type] ?? []).filter(f => f !== fn)
		},
	},
	configurable: true,
	writable: true,
})
globalThis.sessionStorage = sessionStorage
globalThis.localStorage = localStorage

// ---- recorded fetch -----------------------------------------------------

let calls = []
let configMode = 'always'
let configFetchFails = false
let nextSessionId = 0

globalThis.fetch = async (url, init = {}) => {
	const href = String(url)
	calls.push({ url: href, method: init.method ?? 'GET', body: init.body })
	if (href.includes('/api/feedback?')) {
		if (configFetchFails) throw new Error('network down')
		return new Response(
			JSON.stringify({
				valid: true,
				settings: { allowedDomains: [], customization: {}, sessionContext: configMode },
			}),
			{ status: 200 },
		)
	}
	if (href.endsWith('/api/replay-sessions')) {
		nextSessionId += 1
		return new Response(
			JSON.stringify({ accepted: true, sessionReplayId: `session-${nextSessionId}` }),
			{ status: 200 },
		)
	}
	return new Response('{}', { status: 200 })
}

const { sessionReplay, __test__ } = await import('../dist-test/replay.js')

// ---- fake rrweb ---------------------------------------------------------

// Records how many times the loader was asked for a recorder, and what
// options each record() call received. `loads` is the assertion that backs
// "rrweb is never even loaded".
let loads = 0
let recordOptions = []

function installFakeRrweb({ emitSnapshot = true } = {}) {
	loads = 0
	recordOptions = []
	__test__.setRrwebLoader(async () => {
		loads += 1
		const record = opts => {
			recordOptions.push(opts)
			const now = Date.now()
			// rrweb emits Meta, then the FullSnapshot, synchronously from
			// inside record(). Incrementals follow as the user moves around.
			opts.emit({ type: 4, data: { href: 'https://app.example/checkout' }, timestamp: now })
			opts.emit({ type: 3, data: { source: 2 }, timestamp: now + 1 })
			if (emitSnapshot) {
				opts.emit({ type: 2, data: { node: { id: 1 } }, timestamp: now + 2 })
			}
			opts.emit({ type: 3, data: { source: 1 }, timestamp: now + 3 })
			return () => {}
		}
		record.takeFullSnapshot = () => {}
		record.addCustomEvent = () => {}
		return record
	})
}

// ---- fake plugin context ------------------------------------------------

function makeContext(clientId = 'client-abc') {
	let store
	return {
		clientId,
		baseUrl: 'https://api.example',
		logger: { debug() {}, info() {}, warn() {}, error() {} },
		getStore: () => store,
		setStore: value => {
			store = value
		},
		resolveUser: () => {},
		getSdkSessionId: () => 'sdk-session-1',
		getAnonymousId: () => 'anon-1',
		getUserId: () => null,
		getReplayStartMs: () => null,
		publishReplayStartMs: () => {},
	}
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

function findButton(label) {
	return createdElements.find(el => el.tagName === 'BUTTON' && el.textContent === label)
}

// Answers the consent prompt as soon as it appears. Returns a promise that
// resolves once the click has been dispatched.
async function answerConsent(label) {
	for (let i = 0; i < 100; i += 1) {
		const button = findButton(label)
		if (button) {
			button.click()
			return true
		}
		await delay(5)
	}
	return false
}

const requests = path => calls.filter(c => c.url.includes(path))
// Create calls only. `/api/replay-sessions` is also a prefix of the chunk
// POST and the finalise POST, so match the exact endpoint.
const createCalls = () =>
	calls.filter(c => c.method === 'POST' && c.url.endsWith('/api/replay-sessions'))

beforeEach(() => {
	calls = []
	createdElements = []
	body.children = []
	configMode = 'always'
	configFetchFails = false
	nextSessionId = 0
	// Recording is page-scoped through a globalThis slot. Tests share one
	// process, so a recording left live by an earlier test would be adopted
	// by the next one and quietly invalidate its assertions.
	globalThis.__useroSessionReplayActive__ = undefined
	installFakeRrweb()
})

// ---- snapshot shape -----------------------------------------------------

test('captureSnapshotEvents keeps the meta + fullsnapshot pair and drops incrementals', async () => {
	const events = await __test__.captureSnapshotEvents(
		{
			maskAllInputs: true,
			maskTextSelector: '[data-usero-mask]',
			inlineStylesheet: true,
			blockSelector: '[data-usero-block]',
		},
		{ debug() {}, info() {}, warn() {}, error() {} },
		500,
	)
	assert.ok(events, 'expected a snapshot')
	assert.deepEqual(
		events.map(e => e.type),
		[__test__.RRWEB_EVENT_TYPE_META, __test__.RRWEB_EVENT_TYPE_FULL_SNAPSHOT],
		'only the meta and full snapshot events are kept',
	)
})

test('captureSnapshotEvents honours the recorder masking defaults', async () => {
	await __test__.captureSnapshotEvents(
		{
			maskAllInputs: __test__.DEFAULTS.maskAllInputs,
			maskTextSelector: __test__.DEFAULTS.maskTextSelector,
			inlineStylesheet: __test__.DEFAULTS.inlineStylesheet,
			blockSelector: __test__.DEFAULTS.blockSelector,
		},
		{ debug() {}, info() {}, warn() {}, error() {} },
		500,
	)
	assert.equal(recordOptions.length, 1)
	const opts = recordOptions[0]
	assert.equal(opts.maskAllInputs, true, 'inputs are masked by default')
	assert.equal(opts.maskAllInputs, __test__.DEFAULTS.maskAllInputs)
	assert.equal(opts.maskTextSelector, __test__.DEFAULTS.maskTextSelector)
	assert.ok(opts.blockSelector.startsWith(`${__test__.DEFAULTS.blockSelector}, `), 'the configured block selector still applies')
	assert.equal(opts.inlineStylesheet, __test__.DEFAULTS.inlineStylesheet)
})

test('captureSnapshotEvents always blocks the widget and the consent prompt, whatever blockSelector says', async () => {
	for (const blockSelector of ['[data-usero-block]', '.private', '']) {
		recordOptions = []
		await __test__.captureSnapshotEvents(
			{ maskAllInputs: true, maskTextSelector: '', inlineStylesheet: true, blockSelector },
			{ debug() {}, info() {}, warn() {}, error() {} },
			500,
		)
		const selectors = recordOptions[0].blockSelector.split(',').map(s => s.trim())
		assert.ok(selectors.includes('[data-usero-widget]'), `widget host blocked with blockSelector "${blockSelector}"`)
		assert.ok(selectors.includes('[data-usero-session-context-consent]'), 'consent prompt blocked')
		if (blockSelector) assert.ok(selectors.includes(blockSelector), 'custom selector kept')
	}
})

test('captureSnapshotEvents gives up inside its budget when no snapshot arrives', async () => {
	installFakeRrweb({ emitSnapshot: false })
	const started = Date.now()
	const events = await __test__.captureSnapshotEvents(
		{
			maskAllInputs: true,
			maskTextSelector: '',
			inlineStylesheet: true,
			blockSelector: '',
		},
		{ debug() {}, info() {}, warn() {}, error() {} },
		120,
	)
	assert.equal(events, null)
	assert.ok(Date.now() - started < 1000, 'bounded by the budget, not left hanging')
})

// ---- mode fetch ---------------------------------------------------------

test('the mode is fetched once at init and the config endpoint is not re-hit at submit', async () => {
	configMode = 'always'
	const plugin = sessionReplay({ sampleRate: 0 })
	const ctx = makeContext()
	plugin.onInit(ctx)
	await delay(30)
	await plugin.onFeedbackSubmit(ctx)
	assert.equal(requests('/api/feedback?').length, 1, 'exactly one config fetch per page load')
	plugin.onDestroy(ctx)
})

test('a failed config fetch falls back to always, which is the pre-feature behaviour', async () => {
	configFetchFails = true
	const plugin = sessionReplay()
	const ctx = makeContext()
	plugin.onInit(ctx)
	await delay(40)
	// 'always' means ambient recording bootstraps exactly as it always did.
	assert.equal(createCalls().length, 1, 'recording still starts')
	assert.equal(loads, 1, 'rrweb still loads')
	plugin.onDestroy(ctx)
})

test('the recording option skips the config fetch entirely', async () => {
	const plugin = sessionReplay({ recording: 'never' })
	const ctx = makeContext()
	plugin.onInit(ctx)
	await delay(40)
	assert.equal(requests('/api/feedback?').length, 0, 'no config fetch when overridden')
	const patch = await plugin.onFeedbackSubmit(ctx)
	assert.equal(patch, undefined)
	assert.equal(requests('/api/feedback?').length, 0)
	plugin.onDestroy(ctx)
})

// ---- never --------------------------------------------------------------

test('never bootstraps nothing: no session, no rrweb, no snapshot at submit', async () => {
	configMode = 'never'
	const plugin = sessionReplay()
	const ctx = makeContext()
	plugin.onInit(ctx)
	await delay(40)
	assert.equal(createCalls().length, 0, 'no session row created')
	assert.equal(loads, 0, 'rrweb is never even loaded')

	const patch = await plugin.onFeedbackSubmit(ctx)
	assert.equal(patch, undefined, 'nothing attached to the feedback')
	assert.equal(loads, 0, 'still no rrweb after submit')
	assert.equal(createCalls().length, 0, 'still no session row')
	plugin.onDestroy(ctx)
})

// ---- ask ----------------------------------------------------------------

test('ask never records ambiently', async () => {
	configMode = 'ask'
	const plugin = sessionReplay()
	const ctx = makeContext()
	plugin.onInit(ctx)
	await delay(40)
	assert.equal(createCalls().length, 0, 'no ambient session')
	assert.equal(loads, 0, 'no ambient rrweb load')
	plugin.onDestroy(ctx)
})

// The feedback has already gone out by the time afterFeedbackSubmit runs;
// `feedbackId` and `replayLinkToken` stand in for the POST response.
function submitAndAfter(plugin, ctx, feedbackId = 'fb-1', replayLinkToken = 'link-token-1') {
	const patch = plugin.onFeedbackSubmit(ctx)
	plugin.afterFeedbackSubmit(ctx, {
		submission: { clientId: ctx.clientId, ...(patch ?? {}) },
		feedbackId: Promise.resolve(feedbackId),
		replayLinkToken: Promise.resolve(replayLinkToken),
	})
	return patch
}

async function waitFor(condition, ms = 1000) {
	const started = Date.now()
	while (!condition()) {
		if (Date.now() - started > ms) return false
		await delay(5)
	}
	return true
}

const finaliseCalls = () => calls.filter(c => c.url.includes('/finalise'))

test('ask plus decline: nothing is captured and nothing is transmitted', async () => {
	configMode = 'ask'
	const plugin = sessionReplay()
	const ctx = makeContext()
	plugin.onInit(ctx)
	await delay(40)
	const callsBefore = calls.length

	const patch = submitAndAfter(plugin, ctx)
	assert.equal(patch, undefined, 'nothing awaited or attached before the feedback POST')
	const clicked = await answerConsent("Don't include")
	assert.ok(clicked, 'the consent prompt was shown before anything was captured')
	await delay(30)

	assert.equal(loads, 0, 'the page was never captured, so there is nothing to discard')
	assert.equal(calls.length, callsBefore, 'not one byte about the page left the browser')
	assert.equal(body.children.length, 0, 'the prompt cleans itself up')
	plugin.onDestroy(ctx)
})

test('ask plus Escape declines, and still transmits nothing', async () => {
	configMode = 'ask'
	const plugin = sessionReplay()
	const ctx = makeContext()
	plugin.onInit(ctx)
	await delay(40)
	const callsBefore = calls.length

	submitAndAfter(plugin, ctx)
	assert.ok(await waitFor(() => findButton('Include') !== undefined), 'prompt rendered')
	for (const fn of documentListeners.keydown ?? []) fn({ key: 'Escape' })
	await delay(30)

	assert.equal(loads, 0, 'nothing captured')
	assert.equal(calls.length, callsBefore, 'nothing transmitted')
	assert.equal(body.children.length, 0, 'the prompt is torn down')
	plugin.onDestroy(ctx)
})

test('a failed feedback submit never prompts or captures', async () => {
	configMode = 'ask'
	const plugin = sessionReplay()
	const ctx = makeContext()
	plugin.onInit(ctx)
	await delay(40)
	const callsBefore = calls.length

	submitAndAfter(plugin, ctx, null)
	await delay(40)
	assert.equal(findButton('Include'), undefined, 'no prompt for feedback that did not land')
	assert.equal(loads, 0)
	assert.equal(calls.length, callsBefore)
	plugin.onDestroy(ctx)
})

test('ask plus accept: one snapshot-only session, one chunk, one finalise', async () => {
	configMode = 'ask'
	const plugin = sessionReplay()
	const ctx = makeContext()
	plugin.onInit(ctx)
	await delay(40)

	submitAndAfter(plugin, ctx)
	assert.ok(await answerConsent('Include'), 'prompt shown')
	assert.ok(await waitFor(() => finaliseCalls().length === 1), 'snapshot shipped in the background')

	const creates = createCalls()
	assert.equal(creates.length, 1)
	const createBody = JSON.parse(creates[0].body)
	assert.equal(createBody.snapshotOnly, true)
	assert.equal(createBody.consented, true, 'consent is reported to the server')
	assert.equal(createBody.feedbackId, 'fb-1', 'the create carries the link, independent of the upload')

	const chunks = calls.filter(c => c.method === 'POST' && c.url.includes('/chunks/'))
	assert.equal(chunks.length, 1)
	assert.match(chunks[0].url, /\/chunks\/0\?/, 'a snapshot session has exactly one chunk')

	const finalises = calls.filter(c => c.url.includes('/finalise'))
	assert.equal(finalises.length, 1)
	assert.equal(loads, 1, 'rrweb loaded only after consent')
	plugin.onDestroy(ctx)
})

// ---- always -------------------------------------------------------------

test('always falls back to a snapshot when no recording is active', async () => {
	configMode = 'always'
	// sampleRate 0 stands in for every way a recording can fail to exist:
	// sampled out, bot-gated, or never started.
	const plugin = sessionReplay({ sampleRate: 0 })
	const ctx = makeContext()
	plugin.onInit(ctx)
	await delay(40)
	assert.equal(createCalls().length, 0, 'sampled out, so no recording')

	const patch = submitAndAfter(plugin, ctx)
	assert.equal(patch, undefined, 'the POST does not wait for the snapshot')
	assert.ok(await waitFor(() => finaliseCalls().length === 1), 'the feedback still gets page context')

	const creates = createCalls()
	assert.equal(creates.length, 1)
	const createBody = JSON.parse(creates[0].body)
	assert.equal(createBody.snapshotOnly, true)
	assert.equal(createBody.feedbackId, 'fb-1')
	assert.equal(createBody.linkToken, 'link-token-1', 'the create proves this browser sent the feedback')
	assert.equal(createBody.consented, false, 'always mode does not claim a consent it never asked for')
	assert.equal(body.children.length, 0, 'always mode never shows the prompt')
	plugin.onDestroy(ctx)
})

test('no link token in the feedback response: no snapshot is captured or uploaded', async () => {
	configMode = 'always'
	const plugin = sessionReplay({ sampleRate: 0 })
	const ctx = makeContext()
	plugin.onInit(ctx)
	await delay(40)
	submitAndAfter(plugin, ctx, 'fb-1', null)
	await delay(100)
	assert.equal(createCalls().length, 0, 'nothing could link it, so nothing is sent')
	assert.equal(loads, 0, 'rrweb never loads for it')
	plugin.onDestroy(ctx)
})

test('always does NOT snapshot when a recording is already live', async () => {
	configMode = 'always'
	const plugin = sessionReplay()
	const ctx = makeContext()
	plugin.onInit(ctx)
	await delay(40)
	const creates = createCalls()
	assert.equal(creates.length, 1, 'the ambient session')
	assert.equal(JSON.parse(creates[0].body).snapshotOnly, undefined, 'ambient sessions are not snapshots')

	const patch = await plugin.onFeedbackSubmit(ctx)
	assert.ok(patch)
	assert.equal(patch.sessionReplayId, 'session-1', 'links to the live recording')
	const createsAfter = createCalls()
	assert.equal(createsAfter.length, 1, 'no second, redundant snapshot session')
	plugin.onDestroy(ctx)
})
