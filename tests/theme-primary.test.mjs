// The rating tiles' selected ring and keyboard focus ring must follow
// theme.primary rather than a hard-coded blue.
//
// Run with: node --test tests/theme-primary.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'

const createdElements = []

function fakeElement(tag) {
	const el = {
		tagName: tag,
		style: { cssText: '', background: '', backgroundColor: '', borderLeft: '', borderRight: '', display: '' },
		className: '',
		innerHTML: '',
		textContent: '',
		dataset: {},
		classList: { toggle: () => {} },
		setAttribute: () => {},
		removeAttribute: () => {},
		getAttribute: () => null,
		appendChild: () => {},
		removeChild: () => {},
		remove: () => {},
		focus: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		querySelector: () => null,
		querySelectorAll: () => [],
		attachShadow: () => fakeElement('shadow-root'),
	}
	createdElements.push(el)
	return el
}

globalThis.window = globalThis
globalThis.document = {
	createElement: tag => fakeElement(tag),
	body: { appendChild: () => {}, removeChild: () => {} },
	title: 'Theme Test Page',
	referrer: '',
	visibilityState: 'visible',
	addEventListener: () => {},
	removeEventListener: () => {},
}
globalThis.location = { href: 'https://test.example/theme' }
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
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

test('rating selection and focus rings use theme.primary', () => {
	createdElements.length = 0
	const handle = initUseroFeedbackWidget({ clientId: 'client_theme_primary', theme: { primary: '#16a34a' } })
	handle.open()

	const themeCss = createdElements.find(el => el.textContent.startsWith(':host {'))?.textContent ?? ''
	assert.match(themeCss, /--usero-primary: #16a34a;/)

	const css = createdElements.find(el => el.textContent.includes('.fb-ec--sel'))?.textContent ?? ''
	const sel = css.match(/\.fb-ec--sel ?\{[^}]*\}/)?.[0] ?? ''
	assert.match(sel, /border-color: ?var\(--usero-primary/)
	assert.match(sel, /color-mix\(in srgb, ?var\(--usero-primary/)
	const focus = css.match(/\.fb-eb:focus-visible ?\{[^}]*\}/)?.[0] ?? ''
	assert.match(focus, /outline: ?2px solid var\(--usero-primary/)
	handle.destroy()
})
