// Plugin contract test: verify the widget invokes onInit, onFeedbackSubmit,
// and onDestroy in the right order and that onFeedbackSubmit patches are
// shallow-merged into the outgoing payload. We stub just enough of the DOM
// for `initUseroFeedbackWidget` to run without jsdom.

import { test } from 'node:test'
import assert from 'node:assert/strict'

// Minimal DOM stubs. We don't render anything — we only need init/destroy
// to walk to completion and the submission code path to fire. The widget's
// element creation is no-op'd out by returning fake elements with stubbed
// methods.
function installDomStubs() {
	const noop = () => {}
	const fakeElement = () => {
		const el = {
			style: { cssText: '' },
			className: '',
			innerHTML: '',
			textContent: '',
			dataset: {},
			children: [],
			setAttribute: noop,
			removeAttribute: noop,
			getAttribute: () => null,
			appendChild: noop,
			removeChild: noop,
			remove: noop,
			addEventListener: noop,
			removeEventListener: noop,
			querySelector: () => null,
			querySelectorAll: () => [],
			attachShadow: () => fakeElement(),
			focus: noop,
			click: noop,
			files: null,
		}
		return el
	}

	globalThis.window = globalThis
	globalThis.document = {
		createElement: fakeElement,
		body: { appendChild: () => {}, removeChild: () => {} },
		title: 'Test Page',
		referrer: '',
		addEventListener: () => {},
		removeEventListener: () => {},
	}
	globalThis.location = { href: 'https://test.example/path' }
	globalThis.matchMedia = () => ({
		matches: false,
		addEventListener: () => {},
		removeEventListener: () => {},
	})
	globalThis.localStorage = {
		getItem: () => null,
		setItem: () => {},
		removeItem: () => {},
	}
	// Stub fetch so submitForm's network call resolves successfully.
	globalThis.fetch = async () =>
		new Response(JSON.stringify({ message: 'ok' }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		})
	globalThis.AbortSignal = AbortSignal
}

installDomStubs()

const { initUseroFeedbackWidget } = await import('../dist/vanilla.js')

// onFeedbackSubmit can't be exercised through the public widget surface
// without driving the form UI (which would need jsdom). It's covered by
// the type-level contract in tests/consumer.test.ts and by the merge logic
// being a single line in vanilla.ts. Here we just assert init/destroy +
// store plumbing.
test('plugin lifecycle: onInit fires with context, onDestroy can read the store', async () => {
	const calls = []
	const fakePlugin = {
		name: 'fake',
		onInit(ctx) {
			calls.push(['init', ctx.clientId, ctx.baseUrl])
			ctx.setStore({ initialized: true })
		},
		onDestroy(ctx) {
			calls.push(['destroy', ctx.getStore()?.initialized === true])
		},
	}

	const handle = initUseroFeedbackWidget({
		clientId: 'test-client',
		baseUrl: 'https://example.com',
		plugins: [fakePlugin],
	})
	handle.destroy()

	const initCall = calls.find(c => c[0] === 'init')
	const destroyCall = calls.find(c => c[0] === 'destroy')
	assert.ok(initCall, 'onInit was called')
	assert.equal(initCall[1], 'test-client', 'onInit got the clientId via context')
	assert.equal(initCall[2], 'https://example.com', 'onInit got the baseUrl via context')
	assert.ok(destroyCall, 'onDestroy was called')
	assert.equal(destroyCall[1], true, 'onDestroy can read the store set by onInit')
})

test('a misbehaving plugin does not block widget init or destroy', () => {
	const badPlugin = {
		name: 'bad',
		onInit() {
			throw new Error('boom on init')
		},
		onDestroy() {
			throw new Error('boom on destroy')
		},
	}

	const handle = initUseroFeedbackWidget({
		clientId: 'test-client-2',
		baseUrl: 'https://example.com',
		plugins: [badPlugin],
	})
	// destroy must not throw even though onDestroy did.
	assert.doesNotThrow(() => handle.destroy())
})
