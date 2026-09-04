// Privacy options: `disablePageContext` and `hideTrigger`. Both default
// false with zero behaviour change; these tests pin the opt-in behaviour.
//
// Run with: node --test tests/privacy-options.test.mjs
//
// Same no-jsdom fake-DOM approach as widget-draft.test.mjs.

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
		querySelector: selector => {
			if (!queried.has(selector)) queried.set(selector, fakeElement('queried'))
			return queried.get(selector)
		},
		querySelectorAll: () => [],
		attachShadow: () => fakeElement('shadow-root'),
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
	title: 'Secret Connection - MyApp Desktop',
	referrer: 'https://referring.example/secret-path',
	visibilityState: 'visible',
	addEventListener: () => {},
	removeEventListener: () => {},
}
globalThis.location = { href: 'https://test.example/secret/path?token=abc' }
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

function findPanel() {
	const panel = createdElements.find(el => el.innerHTML.includes('data-role="form"'))
	assert.ok(panel, 'expected a rendered panel element')
	return panel
}

function findButton() {
	// The trigger is the first fb-btn-classed element created for this
	// widget instance (button is appended right after style, before
	// backdrop/panel).
	const button = createdElements.find(el => el.className.includes('fb-btn'))
	assert.ok(button, 'expected a rendered trigger button element')
	return button
}

function typeComment(panel, text) {
	const textarea = panel.querySelector('textarea[data-role="comment"]')
	textarea.value = text
	textarea.fire('input')
}

test('disablePageContext omits pageUrl/pageTitle/referrer from the wire submission', async () => {
	createdElements.length = 0
	const handle = initUseroFeedbackWidget({
		clientId: 'client_privacy_page_context',
		disablePageContext: true,
	})
	handle.open()
	typeComment(findPanel(), 'feedback with no page context')

	const form = findPanel().querySelector('form[data-role="form"]')
	form.fire('submit', { preventDefault: () => {} })
	await new Promise(resolve => setTimeout(resolve, 0))

	const post = feedbackPosts.at(-1)
	assert.ok(post, 'expected a POST to /api/feedback')
	assert.equal(post.clientId, 'client_privacy_page_context')
	assert.equal(post.pageUrl, undefined, 'pageUrl must be omitted')
	assert.equal(post.pageTitle, undefined, 'pageTitle must be omitted')
	assert.equal(post.referrer, undefined, 'referrer must be omitted')
	handle.destroy()
})

test('default behaviour still captures page context (no regression)', async () => {
	createdElements.length = 0
	const handle = initUseroFeedbackWidget({ clientId: 'client_privacy_page_context_default' })
	handle.open()
	typeComment(findPanel(), 'feedback with page context')

	const form = findPanel().querySelector('form[data-role="form"]')
	form.fire('submit', { preventDefault: () => {} })
	await new Promise(resolve => setTimeout(resolve, 0))

	const post = feedbackPosts.at(-1)
	assert.equal(post.pageUrl, 'https://test.example/secret/path?token=abc')
	assert.equal(post.pageTitle, 'Secret Connection - MyApp Desktop')
	assert.equal(post.referrer, 'https://referring.example/secret-path')
	handle.destroy()
})

test('hideTrigger hides the default edge tab but open() still works', () => {
	createdElements.length = 0
	const handle = initUseroFeedbackWidget({
		clientId: 'client_privacy_hide_trigger',
		hideTrigger: true,
	})

	const button = findButton()
	assert.equal(button.style.display, 'none', 'trigger button should be hidden')

	// Programmatic open still works: the host drives its own trigger.
	handle.open()
	const panel = findPanel()
	assert.ok(
		panel.className.includes('fb-pnl--open'),
		'panel should open via the handle even with the trigger hidden',
	)
	handle.destroy()
})

test('default behaviour still shows the trigger (no regression)', () => {
	createdElements.length = 0
	const handle = initUseroFeedbackWidget({ clientId: 'client_privacy_show_trigger' })
	const button = findButton()
	assert.equal(button.style.display, '', 'trigger button should be visible by default')
	handle.destroy()
})
