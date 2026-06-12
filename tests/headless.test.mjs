// Headless feedback controller: createUseroFeedback from '@usero/sdk/headless'.
//
// Run with: node --test tests/headless.test.mjs
//
// Covers the widget-free submission pipeline added in 1.3.0:
//   - submit() builds page context, validates, and POSTs to /api/feedback
//   - validation failures resolve { success: false } without any network
//   - plugin onFeedbackSubmit patches are merged in (this is what gives a
//     custom UI replay linking for free: a replay-style plugin's
//     sessionReplayId/replayOffsetMs land on the wire)
//   - metadata deep-merges across plugins and the instance metadata
//   - a throwing plugin never blocks the submit
//   - whenReady() resolves only after every plugin onInit settles
//   - uploadScreenshot() POSTs multipart to /api/screenshots
//   - identify() dedupes, and logout (null) rotates the anonymousId
//   - notifyShadowMount() dispatches the usero:shadow-update event the
//     replay plugin listens for
//   - destroy() fires plugin onDestroy and inerts the controller
//   - invalid clientId and apiUrl override behaviour
//
// No jsdom: window/document are minimal in-memory stubs, fetch is recorded.

import { test, beforeEach } from 'node:test'
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
const dispatchedEvents = []

Object.defineProperty(globalThis, 'window', {
	value: {
		sessionStorage,
		localStorage,
		location: { href: 'https://app.example/settings' },
		addEventListener() {},
		removeEventListener() {},
		dispatchEvent(event) {
			dispatchedEvents.push(event)
			return true
		},
	},
	configurable: true,
	writable: true,
})
Object.defineProperty(globalThis, 'document', {
	value: {
		title: 'Settings Page',
		referrer: 'https://app.example/home',
		visibilityState: 'visible',
		addEventListener() {},
		removeEventListener() {},
	},
	configurable: true,
	writable: true,
})

// Recorded fetch stub.
const calls = []
globalThis.fetch = async (url, init = {}) => {
	const u = String(url)
	calls.push({ url: u, method: init.method ?? 'GET', body: init.body })
	if (u.endsWith('/api/identify')) {
		return new Response(JSON.stringify({ accepted: true }), { status: 200 })
	}
	if (u.endsWith('/api/screenshots')) {
		return new Response(
			JSON.stringify({
				success: true,
				screenshot: {
					fileName: 'shot.png',
					url: 'https://cdn.example/shot.png',
					fileSize: 123,
					mimeType: 'image/png',
				},
			}),
			{ status: 200 },
		)
	}
	return new Response(JSON.stringify({ message: 'ok' }), { status: 200 })
}

const headless = await import('../dist/headless.js')
const { createUseroFeedback } = headless

const settle = () => new Promise(resolve => setTimeout(resolve, 25))

function feedbackCalls() {
	return calls.filter(c => c.url.endsWith('/api/feedback') && c.method === 'POST')
}
function identifyCalls() {
	return calls.filter(c => c.url.endsWith('/api/identify') && c.method === 'POST')
}
function screenshotCalls() {
	return calls.filter(c => c.url.endsWith('/api/screenshots') && c.method === 'POST')
}

beforeEach(() => {
	calls.length = 0
	dispatchedEvents.length = 0
})

test('controller exposes exactly the headless surface (no open/close/isOpen)', () => {
	const usero = createUseroFeedback({ clientId: 'client_surface' })
	assert.deepEqual(Object.keys(usero).sort(), [
		'destroy',
		'identify',
		'notifyShadowMount',
		'submit',
		'uploadScreenshot',
		'whenReady',
	])
	usero.destroy()
})

test('submit() captures page context and POSTs to /api/feedback', async () => {
	const usero = createUseroFeedback({
		clientId: 'client_submit',
		environment: 'staging',
		metadata: { plan: 'pro' },
	})
	const result = await usero.submit({
		rating: 4,
		comment: '  Love it  ',
		userEmail: ' a@b.co ',
		metadata: { from: 'modal' },
	})
	assert.equal(result.success, true)
	const posts = feedbackCalls()
	assert.equal(posts.length, 1)
	const body = JSON.parse(posts[0].body)
	assert.equal(body.clientId, 'client_submit')
	assert.equal(body.rating, 4)
	assert.equal(body.comment, 'Love it')
	assert.equal(body.userEmail, 'a@b.co')
	assert.equal(body.pageUrl, 'https://app.example/settings')
	assert.equal(body.pageTitle, 'Settings Page')
	assert.equal(body.referrer, 'https://app.example/home')
	assert.equal(body.environment, 'staging')
	assert.deepEqual(body.metadata, { plan: 'pro', from: 'modal' })
	usero.destroy()
})

test('submit() with neither rating nor comment fails validation with no network', async () => {
	const usero = createUseroFeedback({ clientId: 'client_invalid' })
	const result = await usero.submit({})
	assert.equal(result.success, false)
	assert.ok(result.error)
	assert.equal(feedbackCalls().length, 0)
	usero.destroy()
})

test('plugin onFeedbackSubmit patches land on the wire (replay linking)', async () => {
	const replayLike = {
		name: 'replay-like',
		onFeedbackSubmit: () => ({ sessionReplayId: 'replay-9', replayOffsetMs: 1234 }),
	}
	const usero = createUseroFeedback({
		clientId: 'client_plugin',
		plugins: [replayLike],
	})
	await usero.submit({ rating: 3 })
	const body = JSON.parse(feedbackCalls()[0].body)
	assert.equal(body.sessionReplayId, 'replay-9')
	assert.equal(body.replayOffsetMs, 1234)
	usero.destroy()
})

test('plugin metadata deep-merges with instance metadata; throwing plugin is skipped', async () => {
	const metaPlugin = {
		name: 'meta-plugin',
		onFeedbackSubmit: async () => ({ metadata: { device: 'mobile' } }),
	}
	const angryPlugin = {
		name: 'angry-plugin',
		onFeedbackSubmit: () => {
			throw new Error('boom')
		},
	}
	const usero = createUseroFeedback({
		clientId: 'client_merge',
		metadata: { plan: 'pro' },
		plugins: [metaPlugin, angryPlugin],
	})
	const result = await usero.submit({ comment: 'merged' })
	assert.equal(result.success, true)
	const body = JSON.parse(feedbackCalls()[0].body)
	assert.deepEqual(body.metadata, { plan: 'pro', device: 'mobile' })
	usero.destroy()
})

test('whenReady() resolves only after every plugin onInit settles', async () => {
	let initDone = false
	const slowPlugin = {
		name: 'slow-plugin',
		onInit: async () => {
			await new Promise(resolve => setTimeout(resolve, 30))
			initDone = true
		},
	}
	const rejectingPlugin = {
		name: 'rejecting-plugin',
		onInit: async () => {
			throw new Error('init failed')
		},
	}
	const usero = createUseroFeedback({
		clientId: 'client_ready',
		plugins: [slowPlugin, rejectingPlugin],
	})
	assert.equal(initDone, false)
	await usero.whenReady()
	assert.equal(initDone, true)
	usero.destroy()
})

test('uploadScreenshot() POSTs multipart and returns ScreenshotData', async () => {
	const usero = createUseroFeedback({ clientId: 'client_shot' })
	const file = new File(['png-bytes'], 'shot.png', { type: 'image/png' })
	const shot = await usero.uploadScreenshot(file)
	assert.equal(shot.url, 'https://cdn.example/shot.png')
	assert.equal(shot.fileName, 'shot.png')
	const posts = screenshotCalls()
	assert.equal(posts.length, 1)
	assert.ok(posts[0].body instanceof FormData)
	assert.equal(posts[0].body.get('clientId'), 'client_shot')

	// And the returned data flows into a later submit.
	await usero.submit({ rating: 2, screenshots: [shot] })
	const body = JSON.parse(feedbackCalls()[0].body)
	assert.equal(body.screenshots.length, 1)
	assert.equal(body.screenshots[0].url, 'https://cdn.example/shot.png')
	usero.destroy()
})

test('identify() fires /api/identify once per distinct user; logout rotates anonymousId', async () => {
	const usero = createUseroFeedback({ clientId: 'client_identify' })
	usero.identify({ id: 'user-1', email: 'u1@example.com' })
	await settle()
	assert.equal(identifyCalls().length, 1)
	const firstBody = JSON.parse(identifyCalls()[0].body)
	assert.equal(firstBody.externalUserId, 'user-1')
	const firstAnonymousId = firstBody.anonymousId
	assert.ok(firstAnonymousId)

	// Same user again: deduped, no second POST.
	usero.identify({ id: 'user-1', email: 'u1@example.com' })
	await settle()
	assert.equal(identifyCalls().length, 1)

	// Logout rotates the anonymousId, so the next identify links a fresh
	// anonymous trail.
	usero.identify(null)
	usero.identify({ id: 'user-2', email: 'u2@example.com' })
	await settle()
	assert.equal(identifyCalls().length, 2)
	const secondBody = JSON.parse(identifyCalls()[1].body)
	assert.equal(secondBody.externalUserId, 'user-2')
	assert.notEqual(secondBody.anonymousId, firstAnonymousId)
	usero.destroy()
})

test('getUser is re-resolved at submit time', async () => {
	let currentUser = null
	const usero = createUseroFeedback({
		clientId: 'client_getuser',
		getUser: () => currentUser,
	})
	await settle()
	const before = identifyCalls().length

	// User logs in after creation; the next submit picks it up.
	currentUser = { id: 'user-late', email: 'late@example.com' }
	await usero.submit({ rating: 1 })
	await settle()
	assert.equal(identifyCalls().length, before + 1)
	usero.destroy()
})

test('notifyShadowMount() dispatches usero:shadow-update with the root', () => {
	const usero = createUseroFeedback({ clientId: 'client_shadow' })
	const host = { tagName: 'DIV' }
	const fakeRoot = { host }
	usero.notifyShadowMount(fakeRoot)
	assert.equal(dispatchedEvents.length, 1)
	assert.equal(dispatchedEvents[0].type, 'usero:shadow-update')
	assert.equal(dispatchedEvents[0].detail.root, fakeRoot)
	assert.equal(dispatchedEvents[0].detail.host, host)
	assert.equal(dispatchedEvents[0].detail.reason, 'mount')
	usero.destroy()
})

test('destroy() fires plugin onDestroy and inerts the controller', async () => {
	let destroyed = 0
	const plugin = {
		name: 'teardown-plugin',
		onDestroy: () => {
			destroyed += 1
		},
	}
	const usero = createUseroFeedback({ clientId: 'client_destroy', plugins: [plugin] })
	usero.destroy()
	usero.destroy() // idempotent
	assert.equal(destroyed, 1)

	const result = await usero.submit({ rating: 4 })
	assert.equal(result.success, false)
	assert.equal(feedbackCalls().length, 0)
	await assert.rejects(() => usero.uploadScreenshot(new File(['x'], 'x.png')))
	usero.notifyShadowMount({ host: null }) // no-op, no throw
	assert.equal(dispatchedEvents.length, 0)
})

test('invalid clientId returns an inert controller instead of throwing', async () => {
	const usero = createUseroFeedback({ clientId: '' })
	const result = await usero.submit({ rating: 4 })
	assert.equal(result.success, false)
	assert.equal(feedbackCalls().length, 0)
	await usero.whenReady() // resolves immediately
	usero.destroy()
})

test('apiUrl override routes every call to the custom origin', async () => {
	const usero = createUseroFeedback({
		clientId: 'client_custom_origin',
		apiUrl: 'https://feedback.selfhosted.dev/',
	})
	await usero.submit({ rating: 4 })
	const posts = feedbackCalls()
	assert.equal(posts.length, 1)
	assert.equal(posts[0].url, 'https://feedback.selfhosted.dev/api/feedback')
	usero.destroy()
})
