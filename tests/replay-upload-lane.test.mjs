// Session replay upload lane: a slow network must merge chunks, not drop them, and anything that
// is lost as a last resort must be counted and reported to the server.
//
// Run with: node --test tests/replay-upload-lane.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gunzipSync } from 'node:zlib'

import { __test__ } from '../dist-test/replay.js'

const { scheduleChunkUpload, maybeIsolateSnapshot, flushForUnload, DEFAULTS, MAX_BACKLOG_BYTES } = __test__

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
		pendingHasSnapshot: false,
		lastUploadDropWarnAt: 0,
		droppedSinceLastUpload: 0,
		lastSnapshotFlushAt: 0,
		nextChunkSeq: 0,
		uploadBacklog: [],
		sealedChunks: [],
		uploadQueue: Promise.resolve(),
		uploadLaneRunning: false,
		chunkFlushTimer: null,
		startTimer: null,
		pageHideHandler: null,
		visibilityHandler: null,
		shadowUpdateHandler: null,
		record: null,
		stopRecording: null,
		stopUrlTracking: null,
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
			logger: { debug: () => {}, info: () => {}, warn: (...args) => warnings.push(args), error: () => {} },
			getStore: () => null,
			setStore: () => {},
			resolveUser: () => {},
		},
	}
}

// Mirrors the recorder's emit path: push one event into the pending buffer.
function emit(store, ctx, event, estBytes) {
	const { didIsolate } = maybeIsolateSnapshot(store, ctx, event, Date.now())
	store.pendingEvents.push(event)
	if (event.type === 2) store.pendingHasSnapshot = true
	store.pendingBytes += estBytes
	if (store.pendingFirstTs === null) store.pendingFirstTs = event.timestamp
	store.pendingLastTs = event.timestamp
	if (didIsolate) scheduleChunkUpload(store, ctx)
}

async function drain(store) {
	while (store.uploadLaneRunning || store.uploadBacklog.length > 0 || store.sealedChunks.length > 0) {
		await store.uploadQueue
		await new Promise(resolve => setTimeout(resolve, 0))
	}
}

async function decodeBody(blob) {
	const bytes = Buffer.from(await blob.arrayBuffer())
	const text = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes).toString('utf8') : bytes.toString('utf8')
	return JSON.parse(text)
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

test('3s chunk latency and a burst of chunks: nothing dropped, order and seq preserved', async () => {
	const requests = []
	let inFlight = 0
	let maxInFlight = 0
	globalThis.fetch = async (url, init) => {
		inFlight += 1
		maxInFlight = Math.max(maxInFlight, inFlight)
		const params = new URL(url).searchParams
		requests.push({
			seq: Number(/chunks\/(\d+)/.exec(url)[1]),
			droppedBefore: params.get('droppedBefore'),
			eventCount: Number(params.get('eventCount')),
			events: await decodeBody(init.body),
		})
		await sleep(3000)
		inFlight -= 1
		return new Response('{"ok":true}', { status: 200 })
	}
	const store = makeStore()
	const { ctx } = makeCtx()
	const sent = []
	let ts = 1
	// 12 chunk flushes 100ms apart (the old 3-deep queue dropped from the 4th on), with a
	// FullSnapshot checkout in the middle that isolates into its own chunk.
	for (let flush = 0; flush < 12; flush += 1) {
		for (let i = 0; i < 40; i += 1) {
			const event = { type: 3, data: { flush, i }, timestamp: ts++ }
			sent.push(event)
			emit(store, ctx, event, 256)
		}
		if (flush === 6) {
			const snapshot = { type: 2, data: { node: 'html' }, timestamp: ts++ }
			sent.push(snapshot)
			emit(store, ctx, snapshot, 50_000)
		}
		scheduleChunkUpload(store, ctx)
		await sleep(100)
	}
	await drain(store)

	assert.equal(maxInFlight, 1, 'one request at a time')
	assert.deepEqual(
		requests.map(r => r.seq),
		requests.map((_, i) => i),
		'seqs are contiguous and sent in order',
	)
	assert.ok(requests.every(r => r.droppedBefore === null), 'no chunk reported a gap')
	assert.equal(store.droppedSinceLastUpload, 0)
	assert.ok(requests.every(r => r.eventCount === r.events.length))
	const received = requests.flatMap(r => r.events)
	assert.deepEqual(received, sent, 'every event arrives exactly once, in capture order')
	const snapshotChunk = requests.find(r => r.events.some(e => e.type === 2))
	assert.equal(snapshotChunk.events.length, 1, 'the snapshot still ships in its own chunk')
	assert.ok(requests.length <= 5, `slow requests merge waiting chunks (got ${requests.length} requests)`)
})

test('waiting incremental batches merge; snapshot batches never merge', () => {
	const store = makeStore({ uploadLaneRunning: true })
	const { ctx } = makeCtx()
	const push = (type, estBytes) => {
		emit(store, ctx, { type, data: {}, timestamp: 1 }, estBytes)
		scheduleChunkUpload(store, ctx)
	}
	push(3, 256)
	push(3, 256)
	push(3, 256)
	assert.equal(store.uploadBacklog.length, 1)
	assert.equal(store.uploadBacklog[0].events.length, 3)
	push(2, 50_000)
	push(3, 256)
	assert.deepEqual(
		store.uploadBacklog.map(b => [b.hasSnapshot, b.events.length]),
		[
			[false, 3],
			[true, 1],
			[false, 1],
		],
	)
	assert.equal(store.nextChunkSeq, 0, 'seqs are only assigned when a batch is sealed')
})

test('memory cap: drops the oldest waiting batch, counts it, keeps the newest snapshot', () => {
	const store = makeStore({ uploadLaneRunning: true })
	const { ctx, warnings } = makeCtx()
	// Each batch is too big to merge with another, and four of them cross the cap.
	const size = Math.ceil(MAX_BACKLOG_BYTES * 0.275)
	emit(store, ctx, { type: 2, data: {}, timestamp: 1 }, size)
	scheduleChunkUpload(store, ctx)
	for (let i = 0; i < 3; i += 1) {
		emit(store, ctx, { type: 3, data: { i }, timestamp: 2 + i }, size)
		scheduleChunkUpload(store, ctx)
	}
	assert.equal(store.droppedSinceLastUpload, 1)
	assert.ok(store.uploadBacklog[0].hasSnapshot, 'the only snapshot is kept')
	assert.deepEqual(
		store.uploadBacklog.slice(1).map(b => b.events[0].data.i),
		[1, 2],
	)
	assert.equal(warnings.length, 1)
	assert.match(warnings[0][0], /memory cap/)
})

test('a chunk that fails all attempts is counted and reported on the next chunk', async () => {
	const requests = []
	globalThis.fetch = async url => {
		requests.push(url)
		await sleep(5)
		return requests.length === 1 ? new Response('bad', { status: 400 }) : new Response('{"ok":true}', { status: 200 })
	}
	const store = makeStore()
	store.options.chunkMaxAttempts = 1
	const { ctx } = makeCtx()
	emit(store, ctx, { type: 3, data: 'a', timestamp: 1 }, 256)
	scheduleChunkUpload(store, ctx)
	emit(store, ctx, { type: 3, data: 'b', timestamp: 2 }, 256)
	scheduleChunkUpload(store, ctx)
	await drain(store)
	assert.equal(requests.length, 2)
	const second = new URL(requests[1])
	assert.match(second.pathname, /chunks\/1$/)
	assert.equal(second.searchParams.get('droppedBefore'), '1')
	assert.equal(store.droppedSinceLastUpload, 0)
})

test('flushForUnload fires every waiting chunk at once on keepalive, behind a slow in-flight one', async () => {
	const requests = []
	let releaseFirst
	globalThis.fetch = async (url, init) => {
		requests.push({ url, init })
		if (requests.length === 1) await new Promise(resolve => (releaseFirst = resolve))
		return new Response('{"ok":true}', { status: 200 })
	}
	const store = makeStore()
	const { ctx } = makeCtx()
	emit(store, ctx, { type: 3, data: 'in-flight', timestamp: 1 }, 256)
	scheduleChunkUpload(store, ctx)
	await sleep(10)
	assert.equal(requests.length, 1, 'first chunk is in flight and stalled')
	emit(store, ctx, { type: 3, data: 'waiting', timestamp: 2 }, 256)
	scheduleChunkUpload(store, ctx)
	emit(store, ctx, { type: 3, data: 'pending', timestamp: 3 }, 256)

	flushForUnload(store, ctx)
	// Synchronous: an unloading page never runs the async gzip, so the send must start in the handler.
	assert.equal(requests.length, 2, 'the unload flush fires synchronously, not behind the stalled request')
	const unload = requests[1]
	assert.match(new URL(unload.url).pathname, /chunks\/1$/)
	assert.equal(unload.init.keepalive, true)
	const events = await decodeBody(unload.init.body)
	assert.deepEqual(
		events.map(e => e.data),
		['waiting', 'pending'],
	)

	releaseFirst()
	await drain(store)
	assert.equal(requests.length, 2, 'the lane confirms the unload send instead of resending')
})

test('flushForUnload with a large backlog seals each batch on its own: size cap and snapshot isolation hold', async () => {
	const requests = []
	let releaseFirst
	globalThis.fetch = async (url, init) => {
		requests.push({ url, init })
		if (requests.length === 1) await new Promise(resolve => (releaseFirst = resolve))
		return new Response('{"ok":true}', { status: 200 })
	}
	const store = makeStore()
	const { ctx } = makeCtx()
	emit(store, ctx, { type: 3, data: 'in-flight', timestamp: 0 }, 256)
	scheduleChunkUpload(store, ctx)
	await sleep(10)
	assert.equal(requests.length, 1, 'first chunk is in flight and stalled')

	// Estimated sizes drive merging (a1 + a2 merge, b1 would cross the 2 MB cap); wire sizes drive the 60 KB raw prefix.
	const event = (label, kb) => ({ type: 3, data: `${label}:${'x'.repeat(kb * 1000)}`, timestamp: Date.now() })
	emit(store, ctx, event('a1', 20), 1_000_000)
	scheduleChunkUpload(store, ctx)
	emit(store, ctx, event('a2', 20), 900_000)
	scheduleChunkUpload(store, ctx)
	emit(store, ctx, event('b1', 30), 200_000)
	scheduleChunkUpload(store, ctx)
	store.lastSnapshotFlushAt = 0
	emit(store, ctx, { type: 2, data: 'snapshot', timestamp: Date.now() }, 100_000)
	emit(store, ctx, event('c1', 30), 600_000)
	assert.deepEqual(
		store.uploadBacklog.map(b => b.events.length),
		[2, 1, 1],
		'backlog: merged pair, a single, the isolated snapshot',
	)

	flushForUnload(store, ctx)
	await sleep(50)
	const unload = await Promise.all(
		requests.slice(1).map(async r => ({
			seq: Number(new URL(r.url).pathname.split('/').pop()),
			labels: (await decodeBody(r.init.body)).map(e => String(e.data).split(':')[0]),
		})),
	)
	unload.sort((x, y) => x.seq - y.seq)
	assert.deepEqual(
		unload.map(c => c.labels),
		[['a1', 'a2'], ['b1'], ['snapshot'], ['c1']],
		'raw keepalive prefix, then one chunk per batch, snapshot alone, nothing merged across batches',
	)
	assert.deepEqual(
		unload.map(c => c.seq),
		[1, 2, 3, 4],
	)

	releaseFirst()
	await drain(store)
	assert.equal(requests.length, 5, 'the lane confirms every unload send instead of resending')
})

test('flushForUnload never puts a snapshot in the raw prefix alongside other batches', async () => {
	const requests = []
	globalThis.fetch = async (url, init) => {
		requests.push({ url, init })
		return new Response('{"ok":true}', { status: 200 })
	}
	const store = makeStore({ uploadLaneRunning: true })
	const { ctx } = makeCtx()
	emit(store, ctx, { type: 3, data: 'before', timestamp: 1 }, 256)
	emit(store, ctx, { type: 2, data: 'snapshot', timestamp: 2 }, 256)
	emit(store, ctx, { type: 3, data: 'after', timestamp: 3 }, 256)
	flushForUnload(store, ctx)
	assert.equal(requests.length, 1, 'only the prefix is sent synchronously')
	assert.deepEqual(
		(await decodeBody(requests[0].init.body)).map(e => e.data),
		['before'],
	)
	await sleep(50)
	const bodies = await Promise.all(requests.slice(1).map(r => decodeBody(r.init.body)))
	assert.deepEqual(
		bodies.map(events => events.map(e => e.data)).sort(),
		[['after'], ['snapshot']],
	)
})
