// Trailing-chunk unload flush: the chunk racing pagehide must survive teardown.
//
// Run with: npm test -- tests/user-test-trailing-flush.test.mjs
// (npm test builds first; these import the built ESM from dist/.)

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { __test__ } = await import('../dist/plugins/user-test.js')

const { chunkUrl, isBeaconAvailable, tryBeaconChunk } = __test__

test('chunkUrl builds the indexed chunk URL and strips a trailing slash', () => {
	assert.equal(chunkUrl('https://usero.io/', 'sess1', 3), 'https://usero.io/api/user-test-sessions/sess1/chunk?index=3')
	assert.equal(chunkUrl('https://usero.io', 'sess1', 0), 'https://usero.io/api/user-test-sessions/sess1/chunk?index=0')
})

test('chunkUrl encodes the session id', () => {
	assert.ok(chunkUrl('https://x', 'a/b c', 1).includes(encodeURIComponent('a/b c')))
})

test('isBeaconAvailable is false with no navigator', () => {
	const orig = globalThis.navigator
	// @ts-expect-error deliberate unset for the negative case
	delete globalThis.navigator
	try {
		assert.equal(isBeaconAvailable(), false)
	} finally {
		if (orig !== undefined) globalThis.navigator = orig
	}
})

test('isBeaconAvailable is false when sendBeacon is missing', () => {
	const orig = globalThis.navigator
	globalThis.navigator = {}
	try {
		assert.equal(isBeaconAvailable(), false)
	} finally {
		if (orig !== undefined) globalThis.navigator = orig
		else delete globalThis.navigator
	}
})

test('tryBeaconChunk POSTs the blob to the indexed chunk URL and returns true', () => {
	const orig = globalThis.navigator
	const calls = []
	globalThis.navigator = {
		sendBeacon: (url, data) => {
			calls.push([url, data])
			return true
		},
	}
	try {
		const blob = new Blob(['audio-bytes'], { type: 'audio/webm' })
		assert.equal(tryBeaconChunk('https://usero.io', 'sess1', 7, blob), true)
		assert.equal(calls.length, 1)
		assert.equal(calls[0][0], 'https://usero.io/api/user-test-sessions/sess1/chunk?index=7')
		assert.equal(calls[0][1], blob)
	} finally {
		if (orig !== undefined) globalThis.navigator = orig
		else delete globalThis.navigator
	}
})

test('tryBeaconChunk returns false when the browser refuses to queue', () => {
	const orig = globalThis.navigator
	globalThis.navigator = { sendBeacon: () => false }
	try {
		assert.equal(tryBeaconChunk('https://usero.io', 'sess1', 7, new Blob(['x'])), false)
	} finally {
		if (orig !== undefined) globalThis.navigator = orig
		else delete globalThis.navigator
	}
})

test('tryBeaconChunk returns false when sendBeacon throws', () => {
	const orig = globalThis.navigator
	globalThis.navigator = {
		sendBeacon: () => {
			throw new Error('denied')
		},
	}
	try {
		assert.equal(tryBeaconChunk('https://usero.io', 'sess1', 7, new Blob(['x'])), false)
	} finally {
		if (orig !== undefined) globalThis.navigator = orig
		else delete globalThis.navigator
	}
})

test('tryBeaconChunk returns false with no beacon support (fetch-keepalive fallback)', () => {
	const orig = globalThis.navigator
	delete globalThis.navigator
	try {
		assert.equal(tryBeaconChunk('https://usero.io', 'sess1', 7, new Blob(['x'])), false)
	} finally {
		if (orig !== undefined) globalThis.navigator = orig
	}
})
