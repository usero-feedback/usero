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

// readActiveSession reads window.localStorage at call time, so install a minimal
// in-memory shim on globalThis BEFORE importing the module.
class MemoryStorage {
	#m = new Map()
	getItem(k) {
		return this.#m.has(k) ? this.#m.get(k) : null
	}
	setItem(k, v) {
		this.#m.set(k, String(v))
	}
	removeItem(k) {
		this.#m.delete(k)
	}
}
const localStorage = new MemoryStorage()
globalThis.window = { localStorage }

const { __test__ } = await import('../dist/plugins/user-test.js')

const {
	parseActiveSession,
	readActiveSession,
	clearActiveSession,
	persistActiveSession,
	adoptSession,
	ACTIVE_SESSION_MAX_AGE_MS,
	RESUME_MAX_IDLE_MS,
	ACTIVE_SESSION_STORAGE_KEY,
} = __test__

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

test('RESUME_MAX_IDLE_MS is the documented 30m idle bound', () => {
	assert.equal(RESUME_MAX_IDLE_MS, 30 * 60 * 1000)
})

test('parseActiveSession: round-trips a valid pausedAt', () => {
	const parsed = parseActiveSession({
		slug: 's',
		sessionId: 'id',
		nextChunkIndex: 0,
		startedAt: 1,
		status: 'paused',
		pausedAt: 1_700_000_000_000,
	})
	assert.equal(parsed.pausedAt, 1_700_000_000_000)
})

test('parseActiveSession: drops a non-finite pausedAt', () => {
	const parsed = parseActiveSession({
		slug: 's',
		sessionId: 'id',
		nextChunkIndex: 0,
		startedAt: 1,
		status: 'paused',
		pausedAt: 'no',
	})
	assert.equal(parsed.pausedAt, undefined)
})

// P1-2: a paused session is only RESUME-eligible for RESUME_MAX_IDLE_MS after the
// pause. The 2h startedAt cap never refreshes, so without this an unrelated return
// to the origin within 2h would re-adopt the test and re-acquire the mic.
function writeState(state) {
	localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(state))
}

test('readActiveSession: resumes a recently-paused session (within the idle bound)', () => {
	const now = Date.now()
	writeState({
		slug: 's',
		sessionId: 'id',
		nextChunkIndex: 2,
		startedAt: now - 60_000, // started 1m ago
		status: 'paused',
		pausedAt: now - 5 * 60 * 1000, // paused 5m ago, well within 30m
	})
	const parsed = readActiveSession()
	assert.ok(parsed, 'a fresh pause must resume')
	assert.equal(parsed.sessionId, 'id')
})

test('readActiveSession: drops a paused session idle past RESUME_MAX_IDLE_MS (no silent re-adopt)', () => {
	const now = Date.now()
	writeState({
		slug: 's',
		sessionId: 'id',
		nextChunkIndex: 2,
		// Still within the 2h startedAt cap, so the OLD logic would have resumed it.
		startedAt: now - 90 * 60 * 1000, // started 90m ago (< 2h)
		status: 'paused',
		pausedAt: now - 45 * 60 * 1000, // paused 45m ago (> 30m idle bound)
	})
	assert.equal(readActiveSession(), null, 'a long-idle pause must NOT resume')
	// And it self-clears so an unrelated later visit finds nothing.
	assert.equal(localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY), null)
})

test('readActiveSession: still drops on the 2h startedAt cap even if paused recently', () => {
	const now = Date.now()
	writeState({
		slug: 's',
		sessionId: 'id',
		nextChunkIndex: 0,
		startedAt: now - 3 * 60 * 60 * 1000, // started 3h ago (> 2h cap)
		status: 'paused',
		pausedAt: now - 60_000, // paused 1m ago (fresh)
	})
	assert.equal(readActiveSession(), null, 'the 2h startedAt cap still wins')
})

test('readActiveSession: an active (never-paused) session ignores the idle gate', () => {
	const now = Date.now()
	writeState({
		slug: 's',
		sessionId: 'id',
		nextChunkIndex: 1,
		startedAt: now - 60_000,
		status: 'active', // no pausedAt; idle gate does not apply
	})
	const parsed = readActiveSession()
	assert.ok(parsed)
	assert.equal(parsed.status, 'active')
	clearActiveSession()
})

// Fix 3: pauseFlow sets store.paused BEFORE stopRecording so the final trailing
// `dataavailable` chunk (which routes through enqueueChunk ->
// persistActiveSession(store, store.paused || store.finishFlowRan ? 'paused' :
// 'active')) cannot rewrite the entry to 'active' and drop pausedAt. Without the
// flag the trailing chunk defeated the RESUME_MAX_IDLE_MS idle gate. We simulate
// the exact sequence: pause persist, then a trailing-chunk persist, then assert
// the entry is still paused with pausedAt and the idle gate engages.
function makeStore(overrides = {}) {
	return {
		sessionId: 'id',
		slug: 's',
		chunkIndex: 3,
		startedAt: Date.now() - 60_000,
		sdkSessionId: undefined,
		finishFlowRan: false,
		paused: false,
		...overrides,
	}
}

test('Fix 3: trailing chunk after pause keeps the entry paused with pausedAt', () => {
	clearActiveSession()
	const store = makeStore({ paused: true })
	// pauseFlow's explicit persist.
	persistActiveSession(store, 'paused')
	const afterPause = parseActiveSession(JSON.parse(localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)))
	assert.equal(afterPause.status, 'paused')
	assert.ok(typeof afterPause.pausedAt === 'number', 'pausedAt stamped on pause')

	// The trailing dataavailable chunk advances chunkIndex then persists with the
	// status enqueueChunk derives (store.paused || finishFlowRan ? 'paused' : ...).
	store.chunkIndex += 1
	persistActiveSession(store, store.paused || store.finishFlowRan ? 'paused' : 'active')
	const afterChunk = parseActiveSession(JSON.parse(localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)))
	assert.equal(afterChunk.status, 'paused', 'trailing chunk must NOT flip to active')
	assert.ok(typeof afterChunk.pausedAt === 'number', 'pausedAt survives the trailing chunk')
	assert.equal(afterChunk.nextChunkIndex, 4, 'chunk index still advanced')

	// And the idle gate engages on the persisted entry.
	const readBack = readActiveSession()
	assert.ok(readBack, 'a freshly-paused entry is still resumable')
	assert.equal(readBack.status, 'paused')
	clearActiveSession()
})

test('Fix 3: WITHOUT the paused flag, a trailing chunk would have dropped pausedAt (regression guard)', () => {
	clearActiveSession()
	const store = makeStore({ paused: false }) // simulate the OLD bug: flag never set
	persistActiveSession(store, 'paused')
	// Old code path: enqueueChunk used `store.finishFlowRan ? 'paused' : 'active'`,
	// which with finishFlowRan=false wrote 'active' and dropped pausedAt.
	store.chunkIndex += 1
	persistActiveSession(store, store.finishFlowRan ? 'paused' : 'active')
	const after = parseActiveSession(JSON.parse(localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY)))
	assert.equal(after.status, 'active', 'documents the old clobber: active + no pausedAt')
	assert.equal(after.pausedAt, undefined)
	clearActiveSession()
})

// Fix 5: on resume, only a server "closed" (409/410) clears resume state; a
// transient network/5xx error must map to { kind: 'error' } so init RETAINS the
// resume state and a reload can retry. adoptSession is the pure mapper that the
// init branch keys off; assert the closed-vs-error distinction here.
test('Fix 5: adoptSession maps 409 -> closed (state will be cleared)', async () => {
	const orig = globalThis.fetch
	globalThis.fetch = async () => ({ status: 409, ok: false, json: async () => ({}) })
	try {
		const r = await adoptSession('https://x', 'id')
		assert.equal(r.kind, 'closed')
	} finally {
		globalThis.fetch = orig
	}
})

test('Fix 5: adoptSession maps 410 -> closed', async () => {
	const orig = globalThis.fetch
	globalThis.fetch = async () => ({ status: 410, ok: false, json: async () => ({}) })
	try {
		const r = await adoptSession('https://x', 'id')
		assert.equal(r.kind, 'closed')
	} finally {
		globalThis.fetch = orig
	}
})

test('Fix 5: adoptSession maps a 5xx -> error (state RETAINED for retry, NOT closed)', async () => {
	const orig = globalThis.fetch
	globalThis.fetch = async () => ({ status: 503, ok: false, json: async () => ({}) })
	try {
		const r = await adoptSession('https://x', 'id')
		assert.equal(r.kind, 'error', 'a 5xx is transient, must not be treated as closed')
	} finally {
		globalThis.fetch = orig
	}
})

test('Fix 5: adoptSession maps a fetch reject (offline) -> error (state RETAINED)', async () => {
	const orig = globalThis.fetch
	globalThis.fetch = async () => {
		throw new Error('network down')
	}
	try {
		const r = await adoptSession('https://x', 'id')
		assert.equal(r.kind, 'error', 'an offline fetch reject must not clear resume state')
	} finally {
		globalThis.fetch = orig
	}
})
