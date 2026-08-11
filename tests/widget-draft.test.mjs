// Draft preservation: the widget must not wipe in-progress form state when
// the panel closes or the widget is destroyed and re-inited by its host.
// Regression test for the "modal just closes sometimes and I lose the text
// in it" report: open() used to reset rating/comment/screenshots, so any
// accidental close (stray Escape, backdrop tap, host re-render remounting
// the React wrapper) irrecoverably destroyed the draft.
//
// Run with: node --test tests/widget-draft.test.mjs
//
// Same no-jsdom approach as plugin-contract.test.mjs, but the fake elements
// here memoize querySelector results and record event listeners so the test
// can drive the comment textarea's input handler and the form's submit
// handler through the widget's real wiring.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const createdElements = []

function fakeElement(tag) {
	const listeners = new Map()
	const queried = new Map()
	const el = {
		tagName: tag,
		style: { cssText: '', background: '', backgroundColor: '', borderLeft: '', borderRight: '', display: '', color: '', opacity: '' },
		className: '',
		innerHTML: '',
		textContent: '',
		value: '',
		checked: false,
		disabled: false,
		dataset: {},
		files: null,
		type: '',
		classList: { toggle: () => {} },
		setAttribute: () => {},
		removeAttribute: () => {},
		getAttribute: () => null,
		appendChild: () => {},
		removeChild: () => {},
		remove: () => {},
		focus: () => {},
		click: () => {},
		addEventListener: (type, handler) => {
			const arr = listeners.get(type) ?? []
			arr.push(handler)
			listeners.set(type, arr)
		},
		removeEventListener: () => {},
		// renderPanel re-queries the same selectors after every render();
		// memoizing per selector keeps the fake stable so listeners attach
		// to one element the test can later drive.
		querySelector: selector => {
			if (!queried.has(selector)) queried.set(selector, fakeElement('queried'))
			return queried.get(selector)
		},
		querySelectorAll: () => [],
		attachShadow: () => fakeElement('shadow-root'),
		// Test hook: fire the most recently attached handler for an event
		// type (re-renders re-attach; the latest closure is the live one).
		fire: (type, event = {}) => {
			const arr = listeners.get(type)
			if (!arr || arr.length === 0) throw new Error(`no ${type} listener attached`)
			return arr[arr.length - 1](event)
		},
	}
	createdElements.push(el)
	return el
}

globalThis.window = globalThis
globalThis.document = {
	createElement: tag => fakeElement(tag),
	body: { appendChild: () => {}, removeChild: () => {} },
	title: 'Draft Test Page',
	referrer: '',
	visibilityState: 'visible',
	addEventListener: () => {},
	removeEventListener: () => {},
}
globalThis.location = { href: 'https://test.example/drafts' }
globalThis.matchMedia = () => ({
	matches: false,
	addEventListener: () => {},
	removeEventListener: () => {},
})
globalThis.localStorage = {
	getItem: () => null,
	setItem: () => {},
	removeItem: () => {},
}
globalThis.sessionStorage = globalThis.localStorage
globalThis.requestAnimationFrame = cb => {
	cb(0)
	return 0
}

const feedbackPosts = []
globalThis.fetch = async (url, init = {}) => {
	const u = String(url)
	if (u.endsWith('/api/feedback')) {
		feedbackPosts.push(JSON.parse(init.body))
		return new Response(JSON.stringify({ success: true, message: 'ok' }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		})
	}
	return new Response(JSON.stringify({ success: true, accepted: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	})
}

const { initUseroFeedbackWidget } = await import('../dist/vanilla.js')

// The widget creates its host div first, then style/button/backdrop/panel
// inside the shadow root. The panel is the element whose innerHTML carries
// the form markup, so find it by content after open().
function findPanel() {
	const panel = createdElements.find(el => el.innerHTML.includes('data-role="form"'))
	assert.ok(panel, 'expected a rendered panel element')
	return panel
}

function typeComment(panel, text) {
	const textarea = panel.querySelector('textarea[data-role="comment"]')
	textarea.value = text
	textarea.fire('input')
}

const DRAFT_TEXT = 'important half-written feedback'

test('draft survives close and reopen', () => {
	createdElements.length = 0
	const handle = initUseroFeedbackWidget({ clientId: 'client_draft_reopen' })
	handle.open()
	const panel = findPanel()
	typeComment(panel, DRAFT_TEXT)

	handle.close()
	handle.open()

	assert.ok(
		panel.innerHTML.includes(DRAFT_TEXT),
		'reopened panel should still contain the typed comment',
	)
	handle.destroy()
})

test('draft survives destroy and re-init, then submits the preserved text', async () => {
	createdElements.length = 0
	const first = initUseroFeedbackWidget({ clientId: 'client_draft_reinit' })
	first.open()
	typeComment(findPanel(), DRAFT_TEXT)

	// Host re-render: React wrapper unmounts (destroy) and mounts a fresh
	// widget for the same clientId.
	first.destroy()
	createdElements.length = 0

	const second = initUseroFeedbackWidget({ clientId: 'client_draft_reinit' })
	second.open()
	const panel = findPanel()
	assert.ok(
		panel.innerHTML.includes(DRAFT_TEXT),
		're-inited panel should restore the draft comment',
	)

	const form = panel.querySelector('form[data-role="form"]')
	form.fire('submit', { preventDefault: () => {} })
	// submitForm is async; let the stubbed fetch settle.
	await new Promise(resolve => setTimeout(resolve, 0))

	const post = feedbackPosts.at(-1)
	assert.ok(post, 'expected a POST to /api/feedback')
	assert.equal(post.comment, DRAFT_TEXT)
	assert.equal(post.clientId, 'client_draft_reinit')
	second.destroy()
})

test('successful submit clears the draft for the next session', () => {
	// The previous test submitted successfully, so a fresh widget for the
	// same clientId must start empty.
	createdElements.length = 0
	const handle = initUseroFeedbackWidget({ clientId: 'client_draft_reinit' })
	handle.open()
	const panel = findPanel()
	assert.ok(
		!panel.innerHTML.includes(DRAFT_TEXT),
		'draft must be cleared after a successful submit',
	)
	handle.destroy()
})
