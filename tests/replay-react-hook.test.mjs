// useSessionReplay SSR safety.
//
// Run with: node --test tests/replay-react-hook.test.mjs
//
// This file deliberately installs NO window/document stubs: it simulates a
// server render. The hook must render without touching the DOM, start no
// recording, and make no network calls. (StrictMode safety, the dev-mode
// double effect, reduces to start() idempotency, which is covered in
// tests/replay-standalone.test.mjs.)

import { test } from 'node:test'
import assert from 'node:assert/strict'

import React from 'react'
import { renderToString } from 'react-dom/server'

const fetchCalls = []
globalThis.fetch = async (url, init = {}) => {
	fetchCalls.push({ url: String(url), method: init.method ?? 'GET' })
	return new Response('{}', { status: 200 })
}

const { useSessionReplay } = await import('../dist/replay/react.js')

test('useSessionReplay renders on the server: no crash, no recording, no network', async () => {
	assert.equal(typeof window, 'undefined', 'precondition: simulated server env')

	let returned = null
	function App() {
		returned = useSessionReplay({ clientId: 'client_ssr' })
		return React.createElement('main', null, 'hello')
	}

	const html = renderToString(React.createElement(App))
	assert.match(html, /hello/)

	// The hook returns the instance even on the server so call sites can be
	// unconditional; it just never starts there.
	assert.ok(returned)
	assert.equal(typeof returned.start, 'function')
	assert.equal(typeof returned.stop, 'function')

	// Effects never run during SSR, and start() itself is a no-op without a
	// window, so nothing was created server-side.
	await new Promise(resolve => setTimeout(resolve, 25))
	assert.equal(fetchCalls.length, 0)
	assert.equal(globalThis.__useroSessionReplayActive__, undefined)

	// Even an explicit start() call on the server is safe.
	returned.start()
	await new Promise(resolve => setTimeout(resolve, 25))
	assert.equal(fetchCalls.length, 0)
})
