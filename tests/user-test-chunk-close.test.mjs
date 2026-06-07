// Chunk-upload close handling: unit tests for the decision that distinguishes a
// definitive "session closed" server signal from an ordinary transient failure,
// plus the terminal close-once handler.
//
// Run with: node --test tests/user-test-chunk-close.test.mjs
//
// Background: the server chunk route REJECTS uploads once the session is
// finalising/closed, returning 409 + { closeResume: true }. On that signal the
// SDK must STOP recording, CLEAR the resume state, and show the ended screen,
// and must NOT keep retrying. A normal transient failure (network blip, 5xx,
// 408/429) must still be retried as before; ONLY the closed signal stops.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { __test__ } from '../dist/plugins/user-test.js'

const { classifyChunkResponse, handleSessionClosed } = __test__

// ---------------------------------------------------------------------------
// classifyChunkResponse: the pure decision over (status, body).

test('classify: 2xx success -> ok', () => {
	assert.equal(classifyChunkResponse(200, { ok: true }), 'ok')
	assert.equal(classifyChunkResponse(201, null), 'ok')
})

test('classify: 409 + closeResume:true -> closed (the definitive stop signal)', () => {
	assert.equal(classifyChunkResponse(409, { error: 'Session is finalising', closeResume: true }), 'closed')
})

test('classify: 409 WITHOUT closeResume -> fatal, not closed (do not tear down a resumable session)', () => {
	// completed/failed past the late-chunk grace returns 409 with closeResume:false.
	assert.equal(classifyChunkResponse(409, { error: 'Session is completed' }), 'fatal')
	assert.equal(classifyChunkResponse(409, { error: 'x', closeResume: false }), 'fatal')
})

test('classify: closeResume only counts when strictly true', () => {
	// A truthy-but-not-true value must NOT be read as the close signal.
	assert.equal(classifyChunkResponse(409, { closeResume: 'true' }), 'fatal')
	assert.equal(classifyChunkResponse(409, { closeResume: 1 }), 'fatal')
})

test('classify: malformed / non-object body on 409 -> fatal (never crashes, never falsely closes)', () => {
	assert.equal(classifyChunkResponse(409, null), 'fatal')
	assert.equal(classifyChunkResponse(409, undefined), 'fatal')
	assert.equal(classifyChunkResponse(409, 'closeResume'), 'fatal')
})

test('classify: transient 5xx -> retry', () => {
	assert.equal(classifyChunkResponse(500, null), 'retry')
	assert.equal(classifyChunkResponse(503, { error: 'overloaded' }), 'retry')
})

test('classify: 408 and 429 -> retry', () => {
	assert.equal(classifyChunkResponse(408, null), 'retry')
	assert.equal(classifyChunkResponse(429, null), 'retry')
})

test('classify: ordinary 4xx -> fatal (no retry, no resurrection)', () => {
	assert.equal(classifyChunkResponse(400, { error: 'bad' }), 'fatal')
	assert.equal(classifyChunkResponse(404, null), 'fatal')
	assert.equal(classifyChunkResponse(413, { error: 'too large' }), 'fatal')
})

// ---------------------------------------------------------------------------
// handleSessionClosed: terminal close, fired exactly once.

function storeStub() {
	return { cancelled: false, sessionClosed: false, onSessionClosed: null }
}

test('handleSessionClosed: marks the store closed and invokes the wired callback', () => {
	let calls = 0
	const store = storeStub()
	store.onSessionClosed = () => {
		calls += 1
	}
	handleSessionClosed(store)
	assert.equal(store.sessionClosed, true)
	assert.equal(calls, 1)
})

test('handleSessionClosed: idempotent — several rejected chunks fire the close once', () => {
	let calls = 0
	const store = storeStub()
	store.onSessionClosed = () => {
		calls += 1
	}
	handleSessionClosed(store)
	handleSessionClosed(store)
	handleSessionClosed(store)
	assert.equal(calls, 1)
	assert.equal(store.sessionClosed, true)
})

test('handleSessionClosed: tolerates a missing callback (still flips the guard)', () => {
	const store = storeStub()
	assert.doesNotThrow(() => handleSessionClosed(store))
	assert.equal(store.sessionClosed, true)
})
