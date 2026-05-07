// Plugin contract + session-replay buffer/gzip smoke tests.
//
// Run with: node --test tests/plugin.test.mjs
//
// Uses jsdom-free shimming for the bits the vanilla widget touches in its
// init path (document, window, matchMedia). The widget's render code is
// not exercised here — these tests focus purely on the plugin contract
// (init/submit/destroy) and the session-replay helpers.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { __test__ } from '../dist/plugins/session-replay.js'

const { evictOldEvents, gzipString, uint8ToBase64 } = __test__

test('evictOldEvents drops events older than the window', () => {
	const now = 10_000
	const events = [
		{ type: 0, data: {}, timestamp: 1_000 },
		{ type: 0, data: {}, timestamp: 5_000 },
		{ type: 0, data: {}, timestamp: 8_500 },
		{ type: 0, data: {}, timestamp: 9_900 },
	]
	// 3-second window: cutoff = 7_000, drop the first two.
	evictOldEvents(events, 3, now)
	assert.equal(events.length, 2)
	assert.equal(events[0].timestamp, 8_500)
	assert.equal(events[1].timestamp, 9_900)
})

test('evictOldEvents is a no-op when all events are inside the window', () => {
	const now = 10_000
	const events = [
		{ type: 0, data: {}, timestamp: 8_000 },
		{ type: 0, data: {}, timestamp: 9_000 },
	]
	evictOldEvents(events, 5, now)
	assert.equal(events.length, 2)
})

test('uint8ToBase64 round-trips through atob', () => {
	const bytes = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
	const encoded = uint8ToBase64(bytes)
	assert.equal(encoded, 'SGVsbG8=')
	const decoded = Buffer.from(encoded, 'base64').toString('utf8')
	assert.equal(decoded, 'Hello')
})

test('gzipString produces valid gzip bytes (magic 1f 8b)', async () => {
	const input = JSON.stringify({ events: Array.from({ length: 50 }, (_, i) => ({ i })) })
	const encoded = await gzipString(input)
	const bytes = Buffer.from(encoded, 'base64')
	assert.equal(bytes[0], 0x1f, 'gzip magic byte 0')
	assert.equal(bytes[1], 0x8b, 'gzip magic byte 1')
	// Compressed output should be smaller than the input (the input has lots
	// of repetition so this should hold easily).
	assert.ok(bytes.length < input.length, `compressed (${bytes.length}) should be smaller than input (${input.length})`)
})

test('gzipString round-trips through gunzip', async () => {
	const { gunzipSync } = await import('node:zlib')
	const input = 'a'.repeat(1000) + 'b'.repeat(1000)
	const encoded = await gzipString(input)
	const bytes = Buffer.from(encoded, 'base64')
	const restored = gunzipSync(bytes).toString('utf8')
	assert.equal(restored, input)
})
