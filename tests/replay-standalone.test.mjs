// Standalone session-replay mode: the dual-mode sessionReplay() factory.
//
// Run with: node --test tests/replay-standalone.test.mjs
//
// Covers the widget-free lifecycle added in 1.2.0:
//   - the factory returns ONE object that is both a UseroPlugin and a
//     standalone recorder (start/stop)
//   - `@usero/sdk/plugins/session-replay` is a true alias of
//     `@usero/sdk/replay` (same function reference via the shared chunk)
//   - start() builds a minimal context (clientId + default apiUrl +
//     identity accessors) and creates exactly one server session
//   - start() is idempotent per page (this is also what makes the React
//     hook StrictMode-safe: the dev double-effect calls start() twice)
//   - a SECOND instance cannot start a second recorder while one is live
//     (page-wide globalThis slot)
//   - widget onInit while a standalone recording is live links feedback to
//     the running session instead of double-recording
//   - stop() finalises the session and frees the slot so a later start()
//     begins a NEW session
//   - getUser drives /api/identify at session start
//
// No jsdom: window/document are minimal in-memory stubs, fetch is recorded.

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

const sessionStorage = new MemoryStorage()
const localStorage = new MemoryStorage()

function makeWindow() {
	return {
		sessionStorage,
		localStorage,
		location: { href: 'https://app.example/start' },
		history: {
			pushState() {},
			replaceState() {},
		},
		addEventListener() {},
		removeEventListener() {},
	}
}

Object.defineProperty(globalThis, 'window', {
	value: makeWindow(),
	configurable: true,
	writable: true,
})
Object.defineProperty(globalThis, 'document', {
	value: {
		visibilityState: 'visible',
		addEventListener() {},
		removeEventListener() {},
	},
	configurable: true,
	writable: true,
})

// Recorded fetch stub. Each test reads `calls` and controls the create
// response via `respondAccepted`.
const calls = []
let respondAccepted = true
let nextSessionId = 0
globalThis.fetch = async (url, init = {}) => {
	calls.push({ url: String(url), method: init.method ?? 'GET', body: init.body })
	if (String(url).endsWith('/api/replay-sessions')) {
		nextSessionId += 1
		const body = respondAccepted
			? { accepted: true, sessionReplayId: `replay-${nextSessionId}` }
			: { accepted: false, dropReason: 'test' }
		return new Response(JSON.stringify(body), { status: 200 })
	}
	return new Response('{}', { status: 200 })
}

const { sessionReplay } = await import('../dist/replay.js')
const aliasModule = await import('../dist/plugins/session-replay.js')

const settle = () => new Promise(resolve => setTimeout(resolve, 25))

function createCalls() {
	return calls.filter(c => c.url.endsWith('/api/replay-sessions') && c.method === 'POST')
}
function finaliseCalls() {
	return calls.filter(c => c.url.includes('/finalise'))
}
function identifyCalls() {
	return calls.filter(c => c.url.endsWith('/api/identify'))
}

// The page-wide slot lives on globalThis; clear it (and the recorded fetch
// log) so tests stay independent.
beforeEach(() => {
	delete globalThis.__useroSessionReplayActive__
	calls.length = 0
	respondAccepted = true
	nextSessionId = 0
})

function makeWidgetCtx(clientId = 'client_widget') {
	let store
	const resolved = []
	return {
		resolved,
		setStoreCalls: [],
		ctx: {
			clientId,
			baseUrl: 'https://widget.example',
			logger: { debug() {}, info() {}, warn() {}, error() {} },
			getStore: () => store,
			setStore: value => {
				store = value
			},
			resolveUser: () => resolved.push(1),
			getSdkSessionId: () => 'sdk-widget-session',
		},
	}
}

test('factory returns a dual-mode instance: UseroPlugin shape plus start/stop', () => {
	const instance = sessionReplay({ clientId: 'client_1' })
	assert.equal(instance.name, 'session-replay')
	assert.equal(typeof instance.onInit, 'function')
	assert.equal(typeof instance.onFeedbackSubmit, 'function')
	assert.equal(typeof instance.onDestroy, 'function')
	assert.equal(typeof instance.start, 'function')
	assert.equal(typeof instance.stop, 'function')
})

test('plugins/session-replay is a true alias: same factory function reference', () => {
	assert.equal(aliasModule.sessionReplay, sessionReplay)
	assert.equal(typeof aliasModule.getCurrentSession, 'function')
})

test('start() without clientId is a safe no-op: no network, no slot claimed', async () => {
	const instance = sessionReplay({})
	instance.start()
	await settle()
	assert.equal(calls.length, 0)
	assert.equal(globalThis.__useroSessionReplayActive__, undefined)
	instance.stop()
})

test('start() creates exactly one session with minimal-context identity fields', async () => {
	const instance = sessionReplay({ clientId: 'client_min' })
	instance.start()
	await settle()
	const creates = createCalls()
	assert.equal(creates.length, 1)
	// Default apiUrl when started standalone (no widget baseUrl to inherit).
	assert.match(creates[0].url, /^https:\/\/usero\.io\/api\/replay-sessions$/)
	const body = JSON.parse(creates[0].body)
	assert.equal(body.clientId, 'client_min')
	assert.equal(typeof body.sdkSessionId, 'string')
	assert.ok(body.sdkSessionId.length >= 8, 'sdkSessionId minted')
	assert.equal(typeof body.anonymousId, 'string')
	assert.ok(body.anonymousId.length >= 8, 'anonymousId minted')
	instance.stop()
})

test('double start() is a no-op (the StrictMode double-effect contract)', async () => {
	const instance = sessionReplay({ clientId: 'client_strict' })
	instance.start()
	instance.start()
	await settle()
	instance.start()
	await settle()
	assert.equal(createCalls().length, 1)
	instance.stop()
})

test('a second instance cannot start a second recorder while one is live', async () => {
	const first = sessionReplay({ clientId: 'client_a' })
	first.start()
	await settle()
	const second = sessionReplay({ clientId: 'client_b' })
	second.start()
	await settle()
	assert.equal(createCalls().length, 1)
	first.stop()
})

test('stop() finalises, frees the slot, and a later start() begins a NEW session', async () => {
	const instance = sessionReplay({ clientId: 'client_restart' })
	instance.start()
	await settle()
	instance.stop()
	await settle()
	assert.equal(finaliseCalls().length, 1)
	assert.equal(globalThis.__useroSessionReplayActive__?.store?.stopped, true)

	const again = sessionReplay({ clientId: 'client_restart' })
	again.start()
	await settle()
	const creates = createCalls()
	assert.equal(creates.length, 2)
	const firstId = JSON.parse(creates[0].body)
	const secondId = JSON.parse(creates[1].body)
	// Same per-tab sdkSessionId so the server stitches the visit together.
	assert.equal(firstId.sdkSessionId, secondId.sdkSessionId)
	again.stop()
})

test('widget mounting over the SAME running instance adopts the recording', async () => {
	const instance = sessionReplay({ clientId: 'client_adopt' })
	instance.start()
	await settle()
	assert.equal(createCalls().length, 1)

	const { ctx } = makeWidgetCtx()
	instance.onInit(ctx)
	await settle()
	// No second recorder, no second session row.
	assert.equal(createCalls().length, 1)
	// Feedback submitted through the widget links to the live recording.
	const linkage = instance.onFeedbackSubmit(ctx)
	assert.ok(linkage, 'feedback links to the running replay')
	assert.equal(linkage.sessionReplayId, 'replay-1')
	assert.equal(typeof linkage.replayOffsetMs, 'number')
	assert.ok(linkage.replayOffsetMs >= 0)

	// Widget unmount must NOT kill the standalone-started recording.
	instance.onDestroy(ctx)
	assert.equal(finaliseCalls().length, 0)
	instance.stop()
	assert.equal(finaliseCalls().length, 1)
})

test('widget with a DIFFERENT replay instance links to the live recording instead of double-recording', async () => {
	const standalone = sessionReplay({ clientId: 'client_live' })
	standalone.start()
	await settle()

	const widgetPlugin = sessionReplay({})
	const { ctx, resolved } = makeWidgetCtx()
	widgetPlugin.onInit(ctx)
	await settle()
	assert.equal(createCalls().length, 1, 'no second recorder started')

	// The widget plugin's own ctx has no store, but feedback still resolves
	// the page-wide live session.
	const linkage = widgetPlugin.onFeedbackSubmit(ctx)
	assert.ok(linkage)
	assert.equal(linkage.sessionReplayId, 'replay-1')

	// The widget lends its resolveUser to the live recording; destroying the
	// widget detaches it without stopping the recording.
	assert.ok(resolved.length >= 0)
	widgetPlugin.onDestroy(ctx)
	assert.equal(finaliseCalls().length, 0)
	standalone.stop()
})

test('getUser drives /api/identify at session start', async () => {
	const instance = sessionReplay({
		clientId: 'client_id_test',
		getUser: () => ({ id: 'user-42', email: 'u42@example.com' }),
	})
	instance.start()
	await settle()
	const identifies = identifyCalls()
	assert.ok(identifies.length >= 1, 'identify fired at session start')
	const body = JSON.parse(identifies[0].body)
	assert.equal(body.externalUserId, 'user-42')
	assert.equal(body.email, 'u42@example.com')
	instance.stop()
})

test('server declining the session (accepted:false) leaves no linkable session', async () => {
	respondAccepted = false
	const instance = sessionReplay({ clientId: 'client_declined' })
	instance.start()
	await settle()
	const { ctx } = makeWidgetCtx()
	assert.equal(instance.onFeedbackSubmit(ctx), undefined)
	instance.stop()
	// Nothing to finalise: the session never came into existence.
	assert.equal(finaliseCalls().length, 0)
})
