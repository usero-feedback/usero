// Mic re-acquire debounce: a Bluetooth profile flap fires devicechange +
// track ended + mute together, so the watcher must collapse them into one
// teardown+re-acquire, and must not re-acquire for a fresh flap inside the
// window.
//
// Run with: npm test -- tests/user-test-mic-reacquire.test.mjs
// (npm test builds first; these import the built ESM from dist/.)

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { __test__ } = await import('../dist/plugins/user-test.js')

const { shouldReacquireMic, MIC_REACQUIRE_DEBOUNCE_MS } = __test__

test('debounce window is the documented 3s', () => {
	assert.equal(MIC_REACQUIRE_DEBOUNCE_MS, 3000)
})

test('first flap attempt is allowed (never re-acquired)', () => {
	assert.equal(shouldReacquireMic(10_000, 0), true)
})

test('a second signal inside the window is swallowed (flap storm)', () => {
	const first = 10_000
	assert.equal(shouldReacquireMic(first + 500, first), false)
	assert.equal(shouldReacquireMic(first + 2999, first), false)
})

test('a flap after the window re-acquires again', () => {
	const first = 10_000
	assert.equal(shouldReacquireMic(first + 3000, first), true)
	assert.equal(shouldReacquireMic(first + 60_000, first), true)
})

test('custom debounce widths are honoured', () => {
	assert.equal(shouldReacquireMic(1000, 0, 5000), false)
	assert.equal(shouldReacquireMic(6000, 0, 5000), true)
})
