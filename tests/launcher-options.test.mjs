// Launcher options: `launcherType` ('tab' | 'button' | 'none') and
// `launcherLabel`, plus the deprecated `hideTrigger` alias.
//
// Run with: node --test tests/launcher-options.test.mjs
//
// Same no-jsdom fake-DOM approach as widget-draft.test.mjs.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const createdElements = []

function fakeElement(tag) {
	const listeners = new Map()
	const queried = new Map()
	const attrs = new Map()
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
		attrs,
		classList: { toggle: () => {} },
		setAttribute: (name, value) => attrs.set(name, String(value)),
		removeAttribute: name => attrs.delete(name),
		getAttribute: name => attrs.get(name) ?? null,
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
	title: 'Host page',
	referrer: '',
	visibilityState: 'visible',
	addEventListener: () => {},
	removeEventListener: () => {},
}
globalThis.location = { href: 'https://test.example/' }
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
globalThis.fetch = async () =>
	new Response(JSON.stringify({ success: true }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	})

const { initUseroFeedbackWidget } = await import('../dist/vanilla.js')

function findButton() {
	const button = createdElements.find(el => el.className.includes('fb-btn'))
	assert.ok(button, 'expected a rendered launcher element')
	return button
}

function mount(props) {
	createdElements.length = 0
	const handle = initUseroFeedbackWidget({ clientId: 'client_launcher', ...props })
	return { handle, button: findButton() }
}

test("launcherType 'tab' is the default edge tab, icon only", () => {
	const { handle, button } = mount({})
	assert.ok(button.className.includes('fb-btn--right'), 'default position class')
	assert.ok(!button.className.includes('fb-btn--pill'), 'tab must not get the pill class')
	assert.equal(button.innerHTML, '', 'tab renders no label')
	assert.equal(button.style.display, '', 'tab is visible')
	assert.equal(button.getAttribute('aria-label'), 'Open feedback')
	handle.destroy()
})

test("explicit launcherType 'tab' matches the default", () => {
	const { handle, button } = mount({ launcherType: 'tab' })
	assert.ok(!button.className.includes('fb-btn--pill'))
	assert.equal(button.style.display, '')
	handle.destroy()
})

test("launcherType 'button' renders a labelled corner pill", () => {
	const { handle, button } = mount({
		launcherType: 'button',
		launcherLabel: 'Report a bug',
	})
	assert.ok(button.className.includes('fb-btn--pill'), 'pill class applied')
	assert.ok(button.className.includes('fb-btn--right'), 'corner follows position')
	assert.ok(button.innerHTML.includes('Report a bug'), 'label text rendered')
	assert.ok(button.innerHTML.includes('fb-btn-lbl'), 'label wrapped for ellipsis')
	assert.equal(button.getAttribute('aria-label'), 'Report a bug')
	assert.equal(button.style.display, '', 'pill is visible')
	handle.destroy()
})

test("launcherType 'button' honours position: 'left'", () => {
	const { handle, button } = mount({ launcherType: 'button', position: 'left' })
	assert.ok(button.className.includes('fb-btn--pill'))
	assert.ok(button.className.includes('fb-btn--left'))
	handle.destroy()
})

test("launcherType 'button' falls back to the title for its label", () => {
	const { handle, button } = mount({ launcherType: 'button' })
	assert.ok(button.innerHTML.includes('Share Feedback'), 'default title used as label')
	assert.equal(button.getAttribute('aria-label'), 'Share Feedback')
	handle.destroy()

	const custom = mount({ launcherType: 'button', title: 'Tell us more' })
	assert.ok(custom.button.innerHTML.includes('Tell us more'))
	custom.handle.destroy()
})

test('launcherLabel is HTML-escaped', () => {
	const { handle, button } = mount({
		launcherType: 'button',
		launcherLabel: '<img src=x onerror=alert(1)>',
	})
	assert.ok(!button.innerHTML.includes('<img'), 'label must not inject markup')
	assert.ok(button.innerHTML.includes('&lt;img'))
	handle.destroy()
})

test("launcherType 'none' renders no launcher but open() still works", () => {
	const { handle, button } = mount({ launcherType: 'none' })
	assert.equal(button.style.display, 'none')
	assert.equal(button.getAttribute('aria-hidden'), 'true')
	assert.equal(button.tabIndex, -1)

	handle.open()
	const panel = createdElements.find(el => el.className.includes('fb-pnl--open'))
	assert.ok(panel, 'panel should open via the handle with no launcher')
	handle.destroy()
})

test("hideTrigger is still a working alias for launcherType 'none'", () => {
	const { handle, button } = mount({ hideTrigger: true })
	assert.equal(button.style.display, 'none')
	assert.equal(button.getAttribute('aria-hidden'), 'true')
	handle.destroy()
})

test('launcherType wins when hideTrigger is also set', () => {
	const shown = mount({ hideTrigger: true, launcherType: 'button', launcherLabel: 'Feedback' })
	assert.equal(shown.button.style.display, '', 'launcherType button beats hideTrigger')
	assert.ok(shown.button.innerHTML.includes('Feedback'))
	shown.handle.destroy()

	const hidden = mount({ hideTrigger: false, launcherType: 'none' })
	assert.equal(hidden.button.style.display, 'none', "launcherType 'none' beats hideTrigger false")
	hidden.handle.destroy()
})

test('update() hot-swaps the launcher type and label', () => {
	const { handle, button } = mount({})
	assert.ok(!button.className.includes('fb-btn--pill'))

	handle.update({ launcherType: 'button', launcherLabel: 'Got a minute?' })
	assert.ok(button.className.includes('fb-btn--pill'))
	assert.ok(button.innerHTML.includes('Got a minute?'))

	handle.update({ launcherType: 'none' })
	assert.equal(button.style.display, 'none')
	handle.destroy()
})
