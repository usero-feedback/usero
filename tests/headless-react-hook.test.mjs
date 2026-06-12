// useUseroFeedback SSR safety.
//
// Run with: node --test tests/headless-react-hook.test.mjs
//
// This file deliberately installs NO window/document stubs: it simulates a
// server render. The hook must render without touching the DOM and make no
// network calls, and the facade it returns must be safe to call pre-mount.
// (StrictMode safety, the dev-mode double effect, reduces to the controller
// being cheap to create/destroy/recreate, which is covered by the destroy
// tests in tests/headless.test.mjs.)

import { test } from 'node:test'
import assert from 'node:assert/strict'

import React from 'react'
import { renderToString } from 'react-dom/server'

const fetchCalls = []
globalThis.fetch = async (url, init = {}) => {
	fetchCalls.push({ url: String(url), method: init.method ?? 'GET' })
	return new Response('{}', { status: 200 })
}

const { useUseroFeedback, createUseroFeedback } = await import(
	'../dist/headless/react.js'
)

test('useUseroFeedback renders on the server: no crash, no network, callable facade', async () => {
	assert.equal(typeof window, 'undefined', 'precondition: simulated server env')

	let returned = null
	function App() {
		returned = useUseroFeedback({ clientId: 'client_ssr' })
		return React.createElement('main', null, 'hello')
	}

	const html = renderToString(React.createElement(App))
	assert.match(html, /hello/)

	// The hook returns a stable facade even on the server so call sites can
	// be unconditional.
	assert.ok(returned)
	assert.equal(typeof returned.submit, 'function')
	assert.equal(typeof returned.uploadScreenshot, 'function')
	assert.equal(typeof returned.identify, 'function')
	assert.equal(typeof returned.whenReady, 'function')
	assert.equal(typeof returned.notifyShadowMount, 'function')
	assert.equal(typeof returned.destroy, 'function')

	// Effects never run during SSR, so no controller exists: a pre-mount
	// submit resolves to a failure result instead of throwing, identify is
	// a no-op, and nothing hits the network.
	const result = await returned.submit({ rating: 4 })
	assert.equal(result.success, false)
	returned.identify({ id: 'user-ssr' })
	await assert.rejects(() => returned.uploadScreenshot({}))
	await new Promise(resolve => setTimeout(resolve, 25))
	assert.equal(fetchCalls.length, 0)
})

test('createUseroFeedback without a window returns an inert controller', async () => {
	const usero = createUseroFeedback({ clientId: 'client_ssr_direct' })
	const result = await usero.submit({ rating: 4 })
	assert.equal(result.success, false)
	await usero.whenReady()
	usero.destroy()
	await new Promise(resolve => setTimeout(resolve, 25))
	assert.equal(fetchCalls.length, 0)
})
