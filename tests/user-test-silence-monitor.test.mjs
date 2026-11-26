// Silence monitor over a fake AudioContext: Safari starts the context suspended without a
// user gesture and reads all zeros, which must never raise "Can't hear you".
//
// Run with: npm test (builds first; these import the built ESM from dist/).

import { test, mock, afterEach } from 'node:test'
import assert from 'node:assert/strict'

class FakeNode {
	connections = []
	connect(node) {
		this.connections.push(node)
		return node
	}
	disconnect() {
		this.connections = []
	}
}

class FakeAnalyser extends FakeNode {
	fftSize = 2048
	level = 0
	getFloatTimeDomainData(buf) {
		buf.fill(this.level)
	}
}

class FakeGain extends FakeNode {
	gain = { value: 1 }
}

let lastCtx = null
let gestureFreeResume = false
class FakeAudioContext {
	state = 'suspended'
	resumeWorks = gestureFreeResume
	destination = new FakeNode()
	resumeCalls = 0
	constructor() {
		lastCtx = this
	}
	createMediaStreamSource() {
		this.source = new FakeNode()
		return this.source
	}
	createAnalyser() {
		this.analyser = new FakeAnalyser()
		return this.analyser
	}
	createGain() {
		this.gainNode = new FakeGain()
		return this.gainNode
	}
	resume() {
		this.resumeCalls += 1
		if (this.resumeWorks) this.state = 'running'
		return Promise.resolve()
	}
	close() {
		this.state = 'closed'
		return Promise.resolve()
	}
}

const listeners = new Map()
globalThis.window = {
	AudioContext: FakeAudioContext,
	addEventListener(type, fn) {
		listeners.set(type, fn)
	},
	removeEventListener(type, fn) {
		if (listeners.get(type) === fn) listeners.delete(type)
	},
}

const { __test__ } = await import('../dist/plugins/user-test.js')
const { startSilenceMonitor } = __test__
const logger = { warn() {}, error() {}, info() {}, debug() {} }

afterEach(() => {
	mock.timers.reset()
	listeners.clear()
})

// One poll at a time: a single big tick sets Date.now() to the end before intervals fire.
function advance(ms) {
	for (let t = 0; t < ms; t += 250) mock.timers.tick(250)
}

function start() {
	mock.timers.enable({ apis: ['setInterval', 'Date'] })
	const changes = []
	const monitor = startSilenceMonitor({}, s => changes.push(s), logger)
	return { monitor, changes, ctx: lastCtx }
}

test('suspended context never reports silent, even reading zeros for a long time', () => {
	const { monitor, changes, ctx } = start()
	assert.equal(ctx.state, 'suspended')
	advance(30_000)
	assert.deepEqual(changes, [])
	monitor.stop()
})

test('graph reaches destination through a muted gain node', () => {
	const { monitor, ctx } = start()
	assert.deepEqual(ctx.source.connections, [ctx.analyser])
	assert.deepEqual(ctx.analyser.connections, [ctx.gainNode])
	assert.deepEqual(ctx.gainNode.connections, [ctx.destination])
	assert.equal(ctx.gainNode.gain.value, 0)
	monitor.stop()
	assert.deepEqual(ctx.gainNode.connections, [])
})

test('resume is called at start, and again on the first gesture, then the listeners go', () => {
	const { monitor, changes, ctx } = start()
	assert.equal(ctx.resumeCalls, 1)
	assert.ok(listeners.has('pointerdown'))
	assert.ok(listeners.has('keydown'))
	ctx.resumeWorks = true
	listeners.get('pointerdown')()
	assert.equal(ctx.resumeCalls, 2)
	assert.equal(ctx.state, 'running')
	assert.equal(listeners.size, 0)
	// Now running and still all zeros: a real dead mic is flagged after the sustained window.
	advance(3_000)
	assert.deepEqual(changes, [true])
	monitor.stop()
})

test('running context with live audio stays audible; no gesture listeners needed', () => {
	gestureFreeResume = true
	try {
		const { monitor, changes, ctx } = start()
		assert.equal(ctx.state, 'running')
		assert.equal(listeners.size, 0)
		ctx.analyser.level = 0.05
		advance(10_000)
		assert.deepEqual(changes, [])
		monitor.stop()
	} finally {
		gestureFreeResume = false
	}
})

test('stop removes pending gesture listeners', () => {
	const { monitor } = start()
	assert.equal(listeners.size, 2)
	monitor.stop()
	assert.equal(listeners.size, 0)
})
