// Plugin contract + session-replay chunked-upload smoke tests.
//
// Run with: node --test tests/plugin.test.mjs
//
// These tests exercise the SDK's session-replay plugin without jsdom.
// They focus on the chunking helpers, the gzip path, and the chunk-upload
// retry / idempotency contract (PR B1).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { __test__ } from '../dist/plugins/session-replay.js'

const {
	uint8ToBase64,
	gzipBytes,
	joinUrl,
	uploadChunk,
	createSession,
	scheduleChunkUpload,
	HARD_CHUNK_BYTE_CAP,
	SDK_SESSION_STORAGE_KEY,
	MAX_PENDING_UPLOADS,
	DEFAULTS,
} = __test__

const silentLogger = {
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
}

test('uint8ToBase64 round-trips through atob', () => {
	const bytes = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
	const encoded = uint8ToBase64(bytes)
	assert.equal(encoded, 'SGVsbG8=')
})

test('gzipBytes produces gzip magic bytes (1f 8b)', async () => {
	const input = JSON.stringify({ events: Array.from({ length: 50 }, (_, i) => ({ i })) })
	const bytes = await gzipBytes(input)
	assert.equal(bytes[0], 0x1f, 'gzip magic byte 0')
	assert.equal(bytes[1], 0x8b, 'gzip magic byte 1')
	assert.ok(bytes.byteLength < input.length, 'compressed should be smaller')
})

test('gzipBytes round-trips through gunzip', async () => {
	const { gunzipSync } = await import('node:zlib')
	const input = 'a'.repeat(1000) + 'b'.repeat(1000)
	const bytes = await gzipBytes(input)
	const restored = gunzipSync(Buffer.from(bytes)).toString('utf8')
	assert.equal(restored, input)
})

test('joinUrl strips trailing slashes', () => {
	assert.equal(joinUrl('https://api.example.com/', '/x'), 'https://api.example.com/x')
	assert.equal(joinUrl('https://api.example.com', '/x'), 'https://api.example.com/x')
})

test('HARD_CHUNK_BYTE_CAP matches the documented 4MB server cap', () => {
	assert.equal(HARD_CHUNK_BYTE_CAP, 4 * 1024 * 1024)
})

test('SDK_SESSION_STORAGE_KEY is namespaced', () => {
	assert.match(SDK_SESSION_STORAGE_KEY, /^usero:session-replay:/)
})

// uploadChunk: success on first try
test('uploadChunk: succeeds on first attempt and sends the right headers', async () => {
	const calls = []
	globalThis.fetch = async (url, init) => {
		calls.push({ url, init })
		return new Response('{"ok":true}', { status: 200 })
	}
	const result = await uploadChunk(
		'https://api.example.com',
		'sess-1',
		'client-x',
		3,
		new Uint8Array([1, 2, 3]),
		7,
		2500,
		silentLogger,
		5,
		0,
	)
	assert.equal(result.ok, true)
	assert.equal(result.stopSession, false)
	assert.equal(calls.length, 1)
	assert.equal(calls[0].url, 'https://api.example.com/api/replay-sessions/sess-1/chunks/3')
	assert.equal(calls[0].init.method, 'PUT')
	assert.equal(calls[0].init.headers['Content-Type'], 'application/octet-stream')
	assert.equal(calls[0].init.headers['X-Usero-Client-Id'], 'client-x')
	assert.equal(calls[0].init.headers['X-Usero-Event-Count'], '7')
	assert.equal(calls[0].init.headers['X-Usero-Duration-Ms'], '2500')
	assert.equal(
		calls[0].init.headers['X-Usero-Dropped-Before'],
		undefined,
		'no dropped-before header when count is 0',
	)
})

// uploadChunk: sends X-Usero-Dropped-Before when chunks were dropped
test('uploadChunk: includes X-Usero-Dropped-Before header when droppedBefore > 0', async () => {
	const calls = []
	globalThis.fetch = async (url, init) => {
		calls.push({ url, init })
		return new Response('{"ok":true}', { status: 200 })
	}
	await uploadChunk(
		'https://api.example.com',
		'sess-1',
		'client-x',
		3,
		new Uint8Array([1]),
		1,
		0,
		silentLogger,
		5,
		2,
	)
	assert.equal(calls[0].init.headers['X-Usero-Dropped-Before'], '2')
})

// uploadChunk: 409 stops the session immediately
test('uploadChunk: 409 returns stopSession=true with no retry', async () => {
	let calls = 0
	globalThis.fetch = async () => {
		calls += 1
		return new Response('{"droppedReason":"bot"}', { status: 409 })
	}
	const result = await uploadChunk(
		'https://api.example.com',
		'sess-1',
		'client-x',
		0,
		new Uint8Array([1]),
		1,
		0,
		silentLogger,
		5,
		0,
	)
	assert.equal(result.ok, false)
	assert.equal(result.stopSession, true)
	assert.equal(calls, 1, '409 should not retry')
})

// uploadChunk: 5xx retries with backoff and eventually succeeds
test('uploadChunk: retries 5xx and succeeds on later attempt', async () => {
	let calls = 0
	globalThis.fetch = async () => {
		calls += 1
		if (calls < 3) return new Response('boom', { status: 500 })
		return new Response('{"ok":true}', { status: 200 })
	}
	const result = await uploadChunk(
		'https://api.example.com',
		'sess-1',
		'client-x',
		0,
		new Uint8Array([1]),
		1,
		0,
		silentLogger,
		5,
		0,
	)
	assert.equal(result.ok, true)
	assert.equal(calls, 3, 'should retry until success')
})

// uploadChunk: idempotent retry of same seq is fine on the SDK side — it
// just resends. The server's R2 head-check is what makes that idempotent.
// We verify here that we DO resend (no client-side de-dup) so a transient
// success-with-no-response still gets retried.
test('uploadChunk: resends the same seq across retries (server makes idempotent)', async () => {
	const seqs = []
	let calls = 0
	globalThis.fetch = async (url) => {
		calls += 1
		const m = /chunks\/(\d+)/.exec(url)
		if (m) seqs.push(Number(m[1]))
		if (calls === 1) throw new TypeError('network blip')
		return new Response('{"ok":true}', { status: 200 })
	}
	const result = await uploadChunk(
		'https://api.example.com',
		'sess-1',
		'client-x',
		7,
		new Uint8Array([1]),
		1,
		0,
		silentLogger,
		5,
		0,
	)
	assert.equal(result.ok, true)
	assert.deepEqual(seqs, [7, 7])
})

// uploadChunk: 4xx (other than 408/429) gives up without retry
test('uploadChunk: 400 gives up immediately', async () => {
	let calls = 0
	globalThis.fetch = async () => {
		calls += 1
		return new Response('bad', { status: 400 })
	}
	const result = await uploadChunk(
		'https://api.example.com',
		'sess-1',
		'client-x',
		0,
		new Uint8Array([1]),
		1,
		0,
		silentLogger,
		5,
		0,
	)
	assert.equal(result.ok, false)
	assert.equal(result.stopSession, false)
	assert.equal(calls, 1)
})

// createSession: returns parsed result on 200
test('createSession: parses {accepted,sessionReplayId}', async () => {
	let body = null
	globalThis.fetch = async (_url, init) => {
		body = init && init.body ? JSON.parse(init.body) : null
		return new Response(
			JSON.stringify({ accepted: true, sessionReplayId: 'r-123' }),
			{ status: 200, headers: { 'Content-Type': 'application/json' } },
		)
	}
	// Stub minimal browser globals so createSession can read href + UA.
	globalThis.window = { location: { href: 'https://host.example/page' } }
	globalThis.navigator = { userAgent: 'jest-ua' }
	const result = await createSession('https://api.example.com', 'cl', 'sdk-1', 'test-anon-123')
	assert.deepEqual(result, { accepted: true, sessionReplayId: 'r-123' })
	assert.equal(body.clientId, 'cl')
	assert.equal(body.sdkSessionId, 'sdk-1')
	assert.equal(body.anonymousId, 'test-anon-123', 'anonymousId must be serialized into the body')
	assert.equal(body.startUrl, 'https://host.example/page')
	assert.equal(body.userAgent, 'jest-ua')
	assert.match(body.startedAt, /^\d{4}-\d{2}-\d{2}T/)
})

// createSession: bot-dropped response is honoured
test('createSession: returns accepted=false when bot-gated', async () => {
	globalThis.fetch = async () =>
		new Response(
			JSON.stringify({ accepted: false, dropReason: 'bot' }),
			{ status: 200, headers: { 'Content-Type': 'application/json' } },
		)
	const result = await createSession('https://api.example.com', 'cl', 'sdk-1', 'test-anon-123')
	assert.deepEqual(result, { accepted: false, dropReason: 'bot' })
})

// createSession: network failure returns null
test('createSession: returns null on network failure', async () => {
	globalThis.fetch = async () => {
		throw new TypeError('offline')
	}
	const result = await createSession('https://api.example.com', 'cl', 'sdk-1', 'test-anon-123')
	assert.equal(result, null)
})

// Memory-retention defaults: keep buffers shallow so detached DOM is GC-able.
test('defaults: tight flush cadence + checkout interval', () => {
	assert.equal(DEFAULTS.chunkSeconds, 3)
	assert.equal(DEFAULTS.chunkMaxEvents, 1000)
	assert.equal(DEFAULTS.chunkMaxBytes, 512_000)
	assert.equal(DEFAULTS.checkoutEveryMs, 60_000)
})

function makeStore(overrides = {}) {
	return {
		options: { ...DEFAULTS, apiUrl: 'https://api.example.com' },
		clientId: 'c',
		sdkSessionId: 'sdk-x',
		sessionReplayId: 'r-x',
		recordingStartedAt: 0,
		pendingEvents: [],
		pendingBytes: 0,
		pendingFirstTs: null,
		pendingLastTs: null,
		lastUploadDropWarnAt: 0,
		droppedSinceLastUpload: 0,
		nextChunkSeq: 0,
		uploadQueue: Promise.resolve(),
		pendingUploads: 0,
		chunkFlushTimer: null,
		startTimer: null,
		pageHideHandler: null,
		shadowUpdateHandler: null,
		record: null,
		stopRecording: null,
		loadInProgress: false,
		cancelled: false,
		stopped: false,
		...overrides,
	}
}

function makeCtx() {
	const warnings = []
	return {
		warnings,
		ctx: {
			clientId: 'c',
			baseUrl: 'https://api.example.com',
			logger: {
				debug: () => {},
				info: () => {},
				warn: (...args) => warnings.push(args),
				error: () => {},
			},
			getStore: () => null,
			setStore: () => {},
			resolveUser: () => {},
		},
	}
}

// uploadQueue depth cap: schedule drops chunks once MAX_PENDING_UPLOADS in flight
test('scheduleChunkUpload: drops chunk when uploadQueue is saturated', () => {
	const store = makeStore({
		pendingEvents: [{ type: 0, data: {}, timestamp: 1 }],
		pendingBytes: 10,
		pendingFirstTs: 1,
		pendingLastTs: 1,
		pendingUploads: MAX_PENDING_UPLOADS,
	})
	const { ctx, warnings } = makeCtx()
	scheduleChunkUpload(store, ctx)
	// Drop path: buffer is cleared, no new upload queued, no seq increment.
	assert.equal(store.pendingEvents.length, 0)
	assert.equal(store.pendingBytes, 0)
	assert.equal(store.nextChunkSeq, 0)
	assert.equal(store.pendingUploads, MAX_PENDING_UPLOADS)
	assert.equal(warnings.length, 1, 'should warn on drop')
	assert.match(warnings[0][0], /upload queue full/)
})

// uploadQueue depth cap: warning is rate-limited
test('scheduleChunkUpload: drop warning is rate-limited within the window', () => {
	const store = makeStore({
		pendingEvents: [{ type: 0, data: {}, timestamp: 1 }],
		pendingBytes: 10,
		pendingFirstTs: 1,
		pendingLastTs: 1,
		pendingUploads: MAX_PENDING_UPLOADS,
		lastUploadDropWarnAt: Date.now(),
	})
	const { ctx, warnings } = makeCtx()
	scheduleChunkUpload(store, ctx)
	assert.equal(warnings.length, 0, 'recent warn should suppress repeat')
})

// drop counter: increments on saturation drop, decrements after successful upload
test('scheduleChunkUpload: increments droppedSinceLastUpload on saturation drop', () => {
	const store = makeStore({
		pendingEvents: [{ type: 0, data: {}, timestamp: 1 }],
		pendingBytes: 10,
		pendingFirstTs: 1,
		pendingLastTs: 1,
		pendingUploads: MAX_PENDING_UPLOADS,
	})
	const { ctx } = makeCtx()
	scheduleChunkUpload(store, ctx)
	// Buffer was cleared by the drop path; re-prime before the next attempt.
	store.pendingEvents = [{ type: 0, data: {}, timestamp: 2 }]
	store.pendingBytes = 10
	store.pendingFirstTs = 2
	store.pendingLastTs = 2
	scheduleChunkUpload(store, ctx)
	assert.equal(store.droppedSinceLastUpload, 2)
})

test('scheduleChunkUpload: successful upload clears droppedSinceLastUpload and sends header', async () => {
	const calls = []
	globalThis.fetch = async (url, init) => {
		calls.push({ url, init })
		return new Response('{"ok":true}', { status: 200 })
	}
	const store = makeStore({
		pendingEvents: [{ type: 0, data: {}, timestamp: 1 }],
		pendingBytes: 10,
		pendingFirstTs: 1,
		pendingLastTs: 2,
		droppedSinceLastUpload: 3,
	})
	const { ctx } = makeCtx()
	scheduleChunkUpload(store, ctx)
	await store.uploadQueue
	assert.equal(store.droppedSinceLastUpload, 0)
	assert.equal(calls[0].init.headers['X-Usero-Dropped-Before'], '3')
})

// scheduleChunkUpload: resets pendingBytes when buffer is swapped out
test('scheduleChunkUpload: resets pendingBytes after handoff', async () => {
	globalThis.fetch = async () => new Response('{"ok":true}', { status: 200 })
	const store = makeStore({
		pendingEvents: [{ type: 0, data: {}, timestamp: 1 }],
		pendingBytes: 1234,
		pendingFirstTs: 1,
		pendingLastTs: 2,
	})
	const { ctx } = makeCtx()
	scheduleChunkUpload(store, ctx)
	assert.equal(store.pendingEvents.length, 0)
	assert.equal(store.pendingBytes, 0)
	assert.equal(store.pendingFirstTs, null)
	assert.equal(store.pendingLastTs, null)
	assert.equal(store.nextChunkSeq, 1)
	await store.uploadQueue
	assert.equal(store.pendingUploads, 0)
})
