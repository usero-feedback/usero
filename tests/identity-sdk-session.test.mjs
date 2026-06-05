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
