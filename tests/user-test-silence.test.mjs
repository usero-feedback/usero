// Silent-microphone guard: unit tests for the pure silence-decision functions.
//
// Run with: node --test tests/user-test-silence.test.mjs
//
// These cover the detection core that decides whether a mic stream is silent
// (dead device or a virtual silent input). The decision must be conservative:
// digital silence trips it, but a real voice, even a quiet one, never does.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { __test__ } from '../dist/plugins/user-test.js'

const { isStreamSilent, rmsDbFromSamples, SILENCE_RMS_DB_THRESHOLD, SILENCE_FLOOR_DB, micChipState } = __test__

// Minimal store stub: only the fields micChipState reads.
function storeStub(overrides = {}) {
	return {
		indicatorState: 'recording',
		hasMicPermission: true,
		micAcquiring: false,
		muted: false,
		micSilent: false,
		...overrides,
	}
}

test('micChipState returns "silent" when granted, unmuted, and micSilent', () => {
	assert.equal(micChipState(storeStub({ micSilent: true })), 'silent')
})

test('micChipState: mute takes precedence over silent', () => {
	assert.equal(micChipState(storeStub({ micSilent: true, muted: true })), 'muted')
})

test('micChipState: live audio (not silent) -> recording', () => {
	assert.equal(micChipState(storeStub()), 'recording')
})

test('micChipState: no permission still shows none/connecting, not silent', () => {
	assert.equal(micChipState(storeStub({ hasMicPermission: false, micAcquiring: true, micSilent: true })), 'connecting')
	assert.equal(micChipState(storeStub({ hasMicPermission: false, micAcquiring: false, micSilent: true })), 'none')
})

test('micChipState: silent suppressed once finishing', () => {
	assert.equal(micChipState(storeStub({ micSilent: true, indicatorState: 'finishing' })), 'inactive')
})

// Build a window of `n` samples of a sine wave whose RMS equals `targetRmsDb`.
// For a sine of amplitude A, RMS = A / sqrt(2), so A = rms * sqrt(2).
function sineAtDb(targetRmsDb, n = 2048) {
	const rms = Math.pow(10, targetRmsDb / 20)
	const amp = rms * Math.SQRT2
	const out = new Float32Array(n)
	for (let i = 0; i < n; i += 1) {
		out[i] = amp * Math.sin((2 * Math.PI * i) / 64)
	}
	return out
}

test('threshold is the documented conservative value (-60 dB)', () => {
	assert.equal(SILENCE_RMS_DB_THRESHOLD, -60)
})

test('all-zero window reads as the dB floor, not -Infinity', () => {
	const db = rmsDbFromSamples(new Float32Array(2048))
	assert.equal(db, SILENCE_FLOOR_DB)
	assert.ok(Number.isFinite(db), 'must be finite, never -Infinity')
})

test('empty window reads as the dB floor', () => {
	assert.equal(rmsDbFromSamples([]), SILENCE_FLOOR_DB)
})

test('digital silence (all zeros) -> silent', () => {
	assert.equal(isStreamSilent(new Float32Array(2048)), true)
})

test('peak-zero / -inf level via raw dB number -> silent', () => {
	assert.equal(isStreamSilent(-Infinity), true)
	assert.equal(isStreamSilent(SILENCE_FLOOR_DB), true)
})

test('real speech at -36 dB RMS -> NOT silent', () => {
	const samples = sineAtDb(-36)
	const db = rmsDbFromSamples(samples)
	assert.ok(Math.abs(db - -36) < 0.5, `expected ~-36 dB, got ${db}`)
	assert.equal(isStreamSilent(samples), false)
})

test('quiet-but-present voice at -50 dB RMS -> NOT silent', () => {
	const samples = sineAtDb(-50)
	const db = rmsDbFromSamples(samples)
	assert.ok(Math.abs(db - -50) < 0.5, `expected ~-50 dB, got ${db}`)
	assert.equal(isStreamSilent(samples), false, 'a quiet real voice must never be flagged silent')
})

test('very quiet -55 dB still NOT silent (above the -60 line)', () => {
	assert.equal(isStreamSilent(sineAtDb(-55)), false)
})

test('boundary: exactly at threshold (-60 dB) -> silent (<=)', () => {
	assert.equal(isStreamSilent(-60), true)
})

test('boundary: just above threshold (-59.9 dB) -> NOT silent', () => {
	assert.equal(isStreamSilent(-59.9), false)
})

test('boundary: just below threshold (-61 dB) -> silent', () => {
	assert.equal(isStreamSilent(-61), true)
})

test('isStreamSilent accepts a raw dB number and a sample array equivalently', () => {
	const samples = sineAtDb(-36)
	const db = rmsDbFromSamples(samples)
	assert.equal(isStreamSilent(samples), isStreamSilent(db))
})
