// Resume-across-hard-nav: unit tests for the pure resume-state parser.
//
// Run with: node --test tests/user-test-resume.test.mjs
//
// These cover parseActiveSession, the validation gate the plugin runs over the
// localStorage `usero:user-test:active-session` entry before it will resume a
// session. A malformed or partial entry must parse to null (never resume on
// garbage); a well-formed entry must round-trip its fields.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { __test__ } from '../dist/plugins/user-test.js'

const { parseActiveSession, ACTIVE_SESSION_MAX_AGE_MS } = __test__

test('parseActiveSession: accepts a well-formed active entry', () => {
	const state = {
		slug: 'checkout-flow',
		sessionId: 'abc123',
		nextChunkIndex: 7,
		startedAt: 1_700_000_000_000,
		status: 'active',
	}
	assert.deepEqual(parseActiveSession(state), state)
})

test('parseActiveSession: round-trips a valid sdkSessionId (replay-link key)', () => {
	const state = {
		slug: 'checkout-flow',
		sessionId: 'abc123',
		nextChunkIndex: 2,
		startedAt: 1_700_000_000_000,
		status: 'paused',
		sdkSessionId: 'a1b2c3d4-aaaa-bbbb',
	}
	assert.deepEqual(parseActiveSession(state), state)
})

test('parseActiveSession: drops a malformed sdkSessionId but still resumes audio', () => {
	const parsed = parseActiveSession({
		slug: 's',
		sessionId: 'id',
		nextChunkIndex: 0,
		startedAt: 1,
		sdkSessionId: 'no', // too short for the sanity filter
	})
	assert.ok(parsed, 'entry still parses (audio resume must not depend on the link)')
	assert.equal(parsed.sdkSessionId, undefined)
})

test('parseActiveSession: defaults unknown status to active', () => {
	const parsed = parseActiveSession({
		slug: 's',
		sessionId: 'id',
		nextChunkIndex: 0,
		startedAt: 1,
		status: 'weird',
	})
	assert.equal(parsed.status, 'active')
})

test('parseActiveSession: preserves the paused status', () => {
	const parsed = parseActiveSession({
		slug: 's',
		sessionId: 'id',
		nextChunkIndex: 3,
		startedAt: 1,
		status: 'paused',
	})
	assert.equal(parsed.status, 'paused')
})

test('parseActiveSession: rejects missing slug / sessionId', () => {
	assert.equal(parseActiveSession({ sessionId: 'id', nextChunkIndex: 0, startedAt: 1 }), null)
	assert.equal(parseActiveSession({ slug: 's', nextChunkIndex: 0, startedAt: 1 }), null)
	assert.equal(parseActiveSession({ slug: '', sessionId: 'id', nextChunkIndex: 0, startedAt: 1 }), null)
})

test('parseActiveSession: rejects a non-integer / negative chunk index', () => {
	assert.equal(parseActiveSession({ slug: 's', sessionId: 'id', nextChunkIndex: 1.5, startedAt: 1 }), null)
	assert.equal(parseActiveSession({ slug: 's', sessionId: 'id', nextChunkIndex: -1, startedAt: 1 }), null)
	assert.equal(parseActiveSession({ slug: 's', sessionId: 'id', nextChunkIndex: 'x', startedAt: 1 }), null)
})

test('parseActiveSession: rejects a non-finite startedAt', () => {
	assert.equal(parseActiveSession({ slug: 's', sessionId: 'id', nextChunkIndex: 0, startedAt: 'no' }), null)
	assert.equal(parseActiveSession({ slug: 's', sessionId: 'id', nextChunkIndex: 0, startedAt: NaN }), null)
})

test('parseActiveSession: rejects non-object input', () => {
	assert.equal(parseActiveSession(null), null)
	assert.equal(parseActiveSession(undefined), null)
	assert.equal(parseActiveSession('string'), null)
	assert.equal(parseActiveSession(42), null)
})

test('ACTIVE_SESSION_MAX_AGE_MS is the documented 2h staleness cap', () => {
	assert.equal(ACTIVE_SESSION_MAX_AGE_MS, 2 * 60 * 60 * 1000)
})
