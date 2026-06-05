// reseatSdkSessionId: the resume-across-hard-nav replay-link fix.
//
// Run with: node --test tests/identity-sdk-session.test.mjs
//
// A cross-origin hard nav wipes sessionStorage, so the post-nav document would
// mint a NEW per-tab sdkSessionId and the resumed SessionReplay row would no
// longer share an id with the audio session. The user-test resume path durably
// persists the original id (localStorage) and calls reseatSdkSessionId to force
// the tab back onto it. These tests cover the pure re-seat contract: it writes
// sessionStorage + the in-memory cache, no-ops on a bad id, and overrides a
// previously-minted id.
//
// The identity module reads `window.sessionStorage` at call time, so we install
// a minimal in-memory storage shim on globalThis BEFORE importing the module.

import { test } from 'node:test'
import assert from 'node:assert/strict'

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

const sessionStorage = new MemoryStorage()
const localStorage = new MemoryStorage()
globalThis.window = { sessionStorage, localStorage }
// Node 20 provides a global `crypto` (read-only getter), which identity.ts uses
// for id generation — no shim needed.

const { __identityTest__ } = await import('../dist/vanilla.js')
const { reseatSdkSessionId, getOrMintSdkSessionId, SDK_SESSION_STORAGE_KEY, resetIdentityState } = __identityTest__

test('reseatSdkSessionId writes sessionStorage and is read back by getOrMintSdkSessionId', () => {
	resetIdentityState()
	sessionStorage.removeItem(SDK_SESSION_STORAGE_KEY)
	reseatSdkSessionId('durable-id-12345678')
	assert.equal(sessionStorage.getItem(SDK_SESSION_STORAGE_KEY), 'durable-id-12345678')
	assert.equal(getOrMintSdkSessionId(), 'durable-id-12345678')
})

test('reseatSdkSessionId overrides a freshly-minted id (corrects the cache after replay already read)', () => {
	resetIdentityState()
	sessionStorage.removeItem(SDK_SESSION_STORAGE_KEY)
	// Simulate session-replay minting a fresh id first (the wrong, post-nav one).
	const minted = getOrMintSdkSessionId()
	assert.match(minted, /^[a-z0-9-]{8,}$/i)
	// User-test resume re-seats the durable id; the cache must now return it.
	reseatSdkSessionId('the-original-id-abcdef')
	assert.equal(getOrMintSdkSessionId(), 'the-original-id-abcdef')
	assert.equal(sessionStorage.getItem(SDK_SESSION_STORAGE_KEY), 'the-original-id-abcdef')
})

test('reseatSdkSessionId no-ops on a malformed id (never poisons the tab id)', () => {
	resetIdentityState()
	sessionStorage.removeItem(SDK_SESSION_STORAGE_KEY)
	const real = getOrMintSdkSessionId()
	reseatSdkSessionId('no') // too short for the sanity filter
	assert.equal(getOrMintSdkSessionId(), real)
})

// P1-1: session-replay reads getSdkSessionId() LAZILY (at createSession time),
// not once at onInit. This models the swapped plugin order
// [sessionReplay(), userTest()]: session-replay's onInit runs first (capturing
// the fresh post-nav id), THEN user-test's onInit re-seats the durable id. If
// session-replay had captured the id eagerly at onInit it would write the
// replay row under the stale id; reading lazily at createSession honours the
// re-seat and both orderings land on the SAME id.
test('lazy read at createSession honours a re-seat from a later-registered plugin (swapped order)', () => {
	resetIdentityState()
	sessionStorage.removeItem(SDK_SESSION_STORAGE_KEY)

	// 1. session-replay onInit (registered FIRST) would mint a fresh post-nav id.
	const eagerAtOnInit = getOrMintSdkSessionId()
	assert.match(eagerAtOnInit, /^[a-z0-9-]{8,}$/i)

	// 2. user-test onInit (registered SECOND) re-seats the durable pre-nav id.
	reseatSdkSessionId('durable-pre-nav-id-1234')

	// 3. session-replay's async begin()/createSession reads the id NOW (lazy).
	//    It must see the re-seated id, NOT the stale onInit mint.
	const lazyAtCreateSession = getOrMintSdkSessionId()
	assert.equal(lazyAtCreateSession, 'durable-pre-nav-id-1234')
	assert.notEqual(lazyAtCreateSession, eagerAtOnInit)
})

test('both plugin orderings resolve to the SAME re-seated id at createSession time', () => {
	// Order A: [userTest(), sessionReplay()] — user-test onInit re-seats first.
	resetIdentityState()
	sessionStorage.removeItem(SDK_SESSION_STORAGE_KEY)
	reseatSdkSessionId('shared-resume-id-abcdef')
	const orderA = getOrMintSdkSessionId() // session-replay createSession reads after

	// Order B: [sessionReplay(), userTest()] — session-replay onInit mints first.
	resetIdentityState()
	sessionStorage.removeItem(SDK_SESSION_STORAGE_KEY)
	getOrMintSdkSessionId() // stale onInit mint, discarded by the re-seat
	reseatSdkSessionId('shared-resume-id-abcdef')
	const orderB = getOrMintSdkSessionId() // session-replay createSession reads after

	assert.equal(orderA, 'shared-resume-id-abcdef')
	assert.equal(orderB, 'shared-resume-id-abcdef')
	assert.equal(orderA, orderB)
})
