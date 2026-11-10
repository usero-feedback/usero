// theme.buttonStyle: 'gradient' (default) vs 'flat' fill on the launcher
// and the submit button, with readable text on flat fills.
//
// Run with: node --test tests/button-style.test.mjs
//
// Same no-jsdom fake-DOM approach as launcher-options.test.mjs.

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

function themeCss() {
	const all = createdElements.filter(el => el.textContent.startsWith(':host {'))
	return all[all.length - 1]?.textContent ?? ''
}

function buttonVars() {
	const css = themeCss()
	return {
		background: /--usero-button-background: ([^;]+);/.exec(css)?.[1],
		color: /--usero-button-text: ([^;]+);/.exec(css)?.[1],
	}
}

function mount(props) {
	createdElements.length = 0
	const handle = initUseroFeedbackWidget({ clientId: 'client_button_style', ...props })
	handle.open()
	const sheet = createdElements.find(el => el.textContent.includes('.fb-ec--sel'))?.textContent ?? ''
	assert.match(sheet, /\.fb-btn,\s*\.fb-sub\s*\{\s*background: ?var\(--usero-button-background\);\s*color: ?var\(--usero-button-text\)/)
	return handle
}

test('default buttonStyle keeps the gradient with white text', () => {
	const handle = mount({ theme: { primary: '#ff7a00' } })
	const vars = buttonVars()
	assert.equal(vars.background, 'linear-gradient(135deg, var(--usero-primary), var(--usero-primary-end))')
	assert.equal(vars.color, '#fff')
	assert.match(themeCss(), /--usero-primary-end: #/)
	handle.destroy()
})

test("buttonStyle 'flat' fills with primary and picks dark text on a light primary", () => {
	const handle = mount({ theme: { primary: '#ff7a00', buttonStyle: 'flat' } })
	const vars = buttonVars()
	assert.equal(vars.background, 'var(--usero-primary)')
	assert.equal(vars.color, '#111827')
	assert.match(themeCss(), /--usero-primary: #ff7a00;/)
	handle.destroy()
})

test("buttonStyle 'flat' keeps white text on a dark primary", () => {
	const handle = mount({ theme: { primary: '#1e3a8a', buttonStyle: 'flat' } })
	assert.deepEqual(buttonVars(), { background: 'var(--usero-primary)', color: '#fff' })
	handle.destroy()
})

test('update() can switch buttonStyle to flat', () => {
	const handle = mount({ theme: { primary: '#ff7a00' } })
	assert.match(buttonVars().background ?? '', /gradient/)
	handle.update({ theme: { primary: '#ff7a00', buttonStyle: 'flat' } })
	assert.equal(buttonVars().background, 'var(--usero-primary)')
	handle.destroy()
})
