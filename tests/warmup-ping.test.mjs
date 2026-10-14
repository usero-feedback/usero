// Warm-up ping: opening the panel pings /api/ping with the widget's clientId so
// the server primes the exact Client lookup the submit runs first.
//
// Run with: node --test tests/warmup-ping.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'

function fakeElement(tag) {
	const queried = new Map()
	return {
		tagName: tag,
		style: {},
		className: '',
		innerHTML: '',
		textContent: '',
		value: '',
		dataset: {},
		classList: { toggle: () => {} },
		setAttribute: () => {},
		removeAttribute: () => {},
		getAttribute: () => null,
		appendChild: () => {},
		removeChild: () => {},
		remove: () => {},
		focus: () => {},
		click: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		querySelector: selector => {
			if (!queried.has(selector)) queried.set(selector, fakeElement('queried'))
			return queried.get(selector)
		},
		querySelectorAll: () => [],
		attachShadow: () => fakeElement('shadow-root'),
	}
}

globalThis.window = globalThis
globalThis.document = {
	createElement: tag => fakeElement(tag),
	body: { appendChild: () => {}, removeChild: () => {} },
	title: 'Ping Test Page',
	referrer: '',
	visibilityState: 'visible',
	addEventListener: () => {},
	removeEventListener: () => {},
}
globalThis.location = { href: 'https://test.example/ping' }
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
globalThis.sessionStorage = globalThis.localStorage
globalThis.requestAnimationFrame = cb => {
	cb(0)
	return 0
}

const requests = []
globalThis.fetch = async (url, init = {}) => {
	requests.push({ url: String(url), init })
	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	})
}

const { initUseroFeedbackWidget } = await import('../dist/vanilla.js')

function pings() {
	return requests.filter(r => new URL(r.url).pathname === '/api/ping')
}

test('opening the panel pings with the clientId', () => {
	requests.length = 0
	const handle = initUseroFeedbackWidget({ clientId: 'client_ping_1', baseUrl: 'https://api.example/' })
	assert.equal(pings().length, 0, 'no ping before the panel opens')
	handle.open()
	const [ping] = pings()
	assert.ok(ping, 'expected a warm-up ping on open')
	const url = new URL(ping.url)
	assert.equal(url.origin, 'https://api.example')
	assert.equal(url.searchParams.get('clientId'), 'client_ping_1')
	handle.destroy()
})

test('clientId is URL-encoded', () => {
	requests.length = 0
	const handle = initUseroFeedbackWidget({ clientId: 'a&b=c d/é', baseUrl: 'https://api.example' })
	handle.open()
	const [ping] = pings()
	assert.ok(ping)
	assert.equal(new URL(ping.url).searchParams.get('clientId'), 'a&b=c d/é')
	handle.destroy()
})

test('ping stays a simple GET (no preflight, no body)', () => {
	requests.length = 0
	const handle = initUseroFeedbackWidget({ clientId: 'client_ping_simple', baseUrl: 'https://api.example' })
	handle.open()
	const [ping] = pings()
	assert.ok(ping)
	assert.equal(ping.init.method ?? 'GET', 'GET')
	assert.equal(ping.init.headers, undefined)
	assert.equal(ping.init.body, undefined)
	handle.destroy()
})
