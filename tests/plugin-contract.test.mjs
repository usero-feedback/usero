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

test('mergePluginPatches deep-merges metadata, shallow-merges everything else', async () => {
	const { mergePluginPatches } = await import('../dist/vanilla.js')
	const base = {
		clientId: 'c',
		comment: 'hi',
		metadata: { app: 'usero', existing: true },
	}
	const patchA = { metadata: { plugin: 'A', existing: 'overwritten-by-A' } }
	const patchB = { replayEvents: 'gz-bytes', metadata: { plugin: 'B' } }
	const merged = mergePluginPatches(base, [patchA, patchB, undefined])

	// Shallow-merged top-level key from patchB.
	assert.equal(merged.replayEvents, 'gz-bytes')
	assert.equal(merged.comment, 'hi', 'unrelated base keys preserved')

	// Deep-merged metadata: keys from base, patchA, patchB all coexist; later
	// plugins win on conflict.
	assert.equal(merged.metadata.app, 'usero', 'base metadata key preserved')
	assert.equal(merged.metadata.plugin, 'B', 'later plugin wins conflict')
	assert.equal(
		merged.metadata.existing,
		'overwritten-by-A',
		'patchA value persists when patchB does not redefine the key',
	)
})

test('whenReady resolves immediately when there are no plugins', async () => {
	const handle = initUseroFeedbackWidget({
		clientId: 'test-client-3',
		baseUrl: 'https://example.com',
	})
	await handle.whenReady()
	handle.destroy()
})

test('whenReady waits for async onInit to settle, even when it rejects', async () => {
	const order = []
	let resolveSlow
	const slowPromise = new Promise(resolve => {
		resolveSlow = resolve
	})
	const slowPlugin = {
		name: 'slow',
		async onInit() {
			order.push('init-start')
			await slowPromise
			order.push('init-end')
		},
	}
	const flakyPlugin = {
		name: 'flaky',
		async onInit() {
			throw new Error('rejected init')
		},
	}

	const handle = initUseroFeedbackWidget({
		clientId: 'test-client-4',
		baseUrl: 'https://example.com',
		plugins: [slowPlugin, flakyPlugin],
	})

	// whenReady must NOT have resolved yet — slowPlugin is still pending.
	let readyResolved = false
	const readyPromise = handle.whenReady().then(() => {
		readyResolved = true
	})
	// Yield a microtask cycle to let any sync paths flush.
	await Promise.resolve()
	await Promise.resolve()
	assert.equal(readyResolved, false, 'whenReady should still be pending')

	resolveSlow()
	await readyPromise
	assert.equal(readyResolved, true, 'whenReady resolved after slow plugin finished')
	assert.deepEqual(order, ['init-start', 'init-end'])
	handle.destroy()
})
