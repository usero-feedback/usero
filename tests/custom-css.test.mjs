// Styling contract: --usero-* variables on :host, part="..." names from
// WIDGET_PARTS (types.ts), and the customCss option appended as the last <style>.
//
// Run with: node --test tests/custom-css.test.mjs
//
// Fake DOM like launcher-options.test.mjs, plus a shadow root that tracks
// its children so stylesheet order can be asserted.

import { test } from 'node:test'
import assert from 'node:assert/strict'

const createdElements = []
let lastShadowRoot = null

function fakeElement(tag) {
	const listeners = new Map()
	const queried = new Map()
	const attrs = new Map()
	const children = []
	const el = {
		tagName: tag,
		style: { cssText: '', background: '', display: '' },
		className: '',
		innerHTML: '',
		textContent: '',
		value: '',
		checked: false,
		disabled: false,
		dataset: {},
		files: null,
		type: '',
		parent: null,
		children,
		classList: { toggle: () => {} },
		setAttribute: (name, value) => attrs.set(name, String(value)),
		removeAttribute: name => attrs.delete(name),
		getAttribute: name => attrs.get(name) ?? null,
		hasAttribute: name => attrs.has(name),
		appendChild: child => {
			children.push(child)
			child.parent = el
			return child
		},
		removeChild: () => {},
		remove: () => {
			if (!el.parent) return
			const siblings = el.parent.children
			const idx = siblings.indexOf(el)
			if (idx >= 0) siblings.splice(idx, 1)
			el.parent = null
		},
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
		attachShadow: () => {
			lastShadowRoot = fakeElement('shadow-root')
			return lastShadowRoot
		},
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

// The public contract (types.ts WIDGET_PARTS / WIDGET_CSS_VARIABLES), not exported at runtime.
const WIDGET_PARTS = [
	'launcher',
	'backdrop',
	'panel',
	'header',
	'title',
	'message',
	'close',
	'form',
	'rating',
	'rating-option',
	'rating-option-selected',
	'textarea',
	'char-count',
	'screenshot',
	'email-toggle',
	'email',
	'submit',
]
const WIDGET_CSS_VARIABLES = {
	primary: '--usero-primary',
	background: '--usero-background',
	text: '--usero-text',
	border: '--usero-border',
	shadow: '--usero-shadow',
}

function mount(props = {}) {
	createdElements.length = 0
	const handle = initUseroFeedbackWidget({ clientId: 'client_css', ...props })
	const root = lastShadowRoot
	assert.ok(root, 'expected a shadow root')
	return { handle, root }
}

const styles = root => root.children.filter(c => c.tagName === 'style')
const themeCss = root => {
	const el = styles(root).find(s => s.hasAttribute('data-usero-theme'))
	assert.ok(el, 'expected the theme variables stylesheet')
	return el.textContent
}
const customStyle = root => styles(root).find(s => s.hasAttribute('data-usero-custom-css'))

test('theme values are exposed as --usero-* variables in a :host rule', () => {
	const theme = {
		primary: '#ff0000',
		background: '#0b0b0d',
		text: '#fafafa',
		border: '#333333',
		shadow: '0 1px 2px rgba(0, 0, 0, 0.5)',
	}
	const { handle, root } = mount({ theme })
	const css = themeCss(root)
	assert.match(css, /^:host \{/)
	for (const [key, name] of Object.entries(WIDGET_CSS_VARIABLES)) {
		assert.ok(css.includes(`${name}: ${theme[key]};`), `${name} carries the theme value`)
	}
	assert.deepEqual(Object.values(WIDGET_CSS_VARIABLES).sort(), [
		'--usero-background',
		'--usero-border',
		'--usero-primary',
		'--usero-shadow',
		'--usero-text',
	])

	handle.update({ theme: { ...theme, primary: '#00ff00' } })
	assert.ok(themeCss(root).includes('--usero-primary: #00ff00;'), 'theme update rewrites variables')
	handle.destroy()
})

test('variables live in a :host rule, never an inline style on the host', () => {
	// A page rule on [data-usero-widget] beats :host but loses to an inline
	// style on the host, so the host must not carry the variables inline.
	const { handle } = mount({ theme: { primary: '#123456' } })
	const host = createdElements.find(el => el.getAttribute('data-usero-widget') === '')
	assert.ok(host, 'expected the host element')
	assert.ok(!host.style.cssText.includes('--usero'), 'no inline variables on the host')
	handle.destroy()
})

test('no themed colour is written as an inline style', () => {
	const { handle, root } = mount({ theme: { primary: '#abcdef', text: '#fedcba' } })
	handle.open()
	const panel = root.children.find(c => c.getAttribute('part') === 'panel')
	assert.ok(panel)
	assert.ok(!panel.innerHTML.includes('#abcdef'))
	assert.ok(!panel.innerHTML.includes('#fedcba'))
	assert.ok(!/style="[^"]*color/.test(panel.innerHTML), 'colours come from the stylesheet')
	handle.destroy()
})

test('every WIDGET_PARTS name is rendered', () => {
	const { handle, root } = mount({ clientId: 'client_css_parts' })
	const panel = root.children.find(c => c.getAttribute('part') === 'panel')
	assert.ok(panel)
	const rendered = new Set()
	const collect = () => {
		for (const m of panel.innerHTML.matchAll(/part="([^"]+)"/g)) {
			m[1].split(' ').forEach(p => rendered.add(p))
		}
	}
	for (const child of root.children) {
		const part = child.getAttribute('part')
		if (part) part.split(' ').forEach(p => rendered.add(p))
	}

	handle.open()
	collect()
	// Empty submission fails validation and renders the message part.
	panel.querySelector('form[data-role="form"]').fire('submit', { preventDefault: () => {} })
	collect()
	// Ticking share-email renders the email input part.
	const shareCb = panel.querySelector('input[data-role="share-email"]')
	shareCb.checked = true
	shareCb.fire('change')
	collect()
	handle.destroy()

	const missing = WIDGET_PARTS.filter(p => !rendered.has(p) && p !== 'rating-option-selected')
	assert.deepEqual(missing, [], `parts not rendered: ${missing.join(', ')}`)
})

test('rating-option-selected marks the chosen rating', async () => {
	// Drive a selection through a real querySelectorAll on the panel.
	const { handle, root } = mount({ clientId: 'client_css_rating' })
	const panel = root.children.find(c => c.getAttribute('part') === 'panel')
	const ratingBtn = fakeElement('button')
	ratingBtn.dataset.rating = '3'
	panel.querySelectorAll = selector => (selector === 'button[data-rating]' ? [ratingBtn] : [])
	handle.open()
	ratingBtn.fire('click')
	assert.match(panel.innerHTML, /fb-ec--r3 fb-ec--sel" part="rating-option rating-option-selected"/)
	assert.equal(panel.innerHTML.match(/rating-option-selected/g)?.length, 1)
	handle.destroy()
})

test('customCss is appended as the last <style> and follows updates', () => {
	const { handle, root } = mount({ customCss: '[part~=submit] { background: black; }' })
	let all = styles(root)
	assert.equal(all.length, 3, 'theme, base and custom stylesheets')
	const custom = customStyle(root)
	assert.ok(custom)
	assert.equal(all[all.length - 1], custom, 'custom stylesheet is last')
	assert.equal(custom.textContent, '[part~=submit] { background: black; }')
	assert.equal(custom.innerHTML, '', 'set via textContent, never innerHTML')

	handle.update({ customCss: '.fb-ttl { letter-spacing: 1px; }' })
	assert.equal(customStyle(root), custom, 'same element reused')
	assert.equal(custom.textContent, '.fb-ttl { letter-spacing: 1px; }')

	handle.update({ customCss: '   ' })
	assert.equal(customStyle(root), undefined, 'blank removes the stylesheet')

	handle.update({ customCss: 'a { color: red; }' })
	all = styles(root)
	assert.equal(all[all.length - 1], customStyle(root), 're-added as the last style')

	handle.update({ customCss: undefined })
	assert.equal(customStyle(root), undefined, 'undefined removes the stylesheet')
	handle.destroy()
})

test('no customCss means no custom stylesheet', () => {
	const { handle, root } = mount({})
	assert.equal(customStyle(root), undefined)
	assert.equal(styles(root).length, 2)
	handle.destroy()
})

test('theme values cannot break out of the :host rule', () => {
	const { handle, root } = mount({ theme: { primary: '#ff0000; } body { display: none' } })
	const css = themeCss(root)
	assert.ok(!css.includes('body { display'), 'braces and semicolons stripped')
	handle.destroy()
})
