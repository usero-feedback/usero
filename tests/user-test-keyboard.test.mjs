// Mobile soft-keyboard inset: unit tests for the pure inset math that keeps
// the user-test floating bar and task panel above the keyboard.
//
// Run with: node --test tests/user-test-keyboard.test.mjs
//
// Context: position:fixed anchors to the LAYOUT viewport, which the soft
// keyboard does not shrink, so without the visualViewport watcher the open
// keyboard covers the task instructions entirely (real user report, Chrome on
// Android). computeKeyboardInset derives the covered strip's height from the
// visual-viewport geometry; the watcher feeds it into --keyboard-inset.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { __test__ } from '../dist/plugins/user-test.js'

const { computeKeyboardInset } = __test__

test('keyboard closed: visual viewport fills the layout viewport, inset is 0', () => {
	assert.equal(computeKeyboardInset(800, 800, 0), 0)
})

test('keyboard open: inset is the strip the keyboard covers', () => {
	// 800px layout viewport, 320px keyboard -> 480px visual viewport, no pan.
	assert.equal(computeKeyboardInset(800, 480, 0), 320)
})

test('panned visual viewport: offsetTop reduces the bottom inset', () => {
	// Browser pans the visual viewport down 100px to keep the focused field in
	// view; only 220px of keyboard still overlaps the layout viewport's bottom.
	assert.equal(computeKeyboardInset(800, 480, 100), 220)
})

test('fully panned past the keyboard region clamps to 0, never negative', () => {
	assert.equal(computeKeyboardInset(800, 480, 400), 0)
	assert.equal(computeKeyboardInset(800, 800, 50), 0)
})

test('fractional viewport heights round to whole pixels', () => {
	// visualViewport.height is fractional on many devices (DPR scaling).
	assert.equal(computeKeyboardInset(800, 479.5, 0), 321)
	assert.equal(computeKeyboardInset(800, 480.4, 0), 320)
})
