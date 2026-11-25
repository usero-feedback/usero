// Round 1 testers could not tell the test was recording, and a stray tap on Finish ended one 35s in.
// Covers the fresh-start "Recording your screen and voice" pill and the "Finish the test?" confirm.
//
// Run with: npm test (builds first; these import the built ESM from dist/).

import { test } from 'node:test'
import assert from 'node:assert/strict'

const { __test__ } = await import('../dist/plugins/user-test.js')
const { finishTap, finishConfirmPointer, showStartedToast } = __test__

let focused = null

function fakeEl(name = '') {
	const attrs = new Map()
	const kids = []
	const el = {
		name,
		className: '',
		textContent: '',
		innerHTML: '',
		hidden: false,
		disabled: false,
		isConnected: true,
		onclick: null,
		onkeydown: null,
		kids,
		attrs,
		setAttribute: (k, v) => attrs.set(k, v),
		removeAttribute: k => attrs.delete(k),
		getAttribute: k => attrs.get(k) ?? null,
		hasAttribute: k => attrs.has(k),
		appendChild: k => kids.push(k),
		remove() {},
		focus() { focused = el },
	}
	return el
}

function fakeRoot() {
	globalThis.HTMLElement = Object
	globalThis.document = { createElement: () => fakeEl() }
	globalThis.window = { setTimeout, clearTimeout }
	focused = null
	const keep = fakeEl('keep')
	const yes = fakeEl('yes')
	const confirm = fakeEl('confirm')
	confirm.hidden = true
	confirm.querySelectorAll = sel => (sel === 'button' ? [keep, yes] : [])
	const parts = {
		'.finish-btn': fakeEl('finish'),
		'.finish-confirm': confirm,
		'.toast-slot': fakeEl(),
	}
	return { parts, keep, yes, confirm, querySelector: sel => parts[sel] ?? null }
}

function makeStore(overrides = {}) {
	return {
		indicatorState: 'recording',
		indicatorRoot: fakeRoot(),
		finishConfirmOpen: false,
		hasMicPermission: true,
		resumeToastTimers: [],
		...overrides,
	}
}

// Opens the confirm the way a Finish tap does; returns the store, the fake DOM and how many times the test ended.
function openConfirm() {
	const store = makeStore()
	const ended = { count: 0 }
	const end = () => { ended.count++ }
	finishTap(store, end)
	return { store, root: store.indicatorRoot, ended, end }
}

const key = k => ({ key: k, target: focused, preventDefault() { this.prevented = true } })

test('a fresh start with a live mic shows "Recording your screen and voice"', () => {
	const store = makeStore()
	showStartedToast(store)
	const slot = store.indicatorRoot.parts['.toast-slot']
	assert.equal(slot.kids.length, 1)
	assert.equal(slot.kids[0].getAttribute('role'), 'status')
	assert.equal(slot.kids[0].kids[1].textContent, 'Recording your screen and voice')
})

test('no recording pill when the mic never came up', () => {
	const store = makeStore({ hasMicPermission: false, indicatorState: 'no-audio' })
	showStartedToast(store)
	assert.equal(store.indicatorRoot.parts['.toast-slot'].kids.length, 0)
})

test('Finish while recording opens the confirm with focus on Keep going, and does not end the test', () => {
	const { store, root, ended } = openConfirm()
	assert.equal(ended.count, 0)
	assert.equal(store.finishConfirmOpen, true)
	assert.equal(root.confirm.hidden, false)
	assert.equal(root.parts['.finish-btn'].getAttribute('aria-expanded'), 'true')
	assert.equal(focused, root.keep)
})

test('Keep going closes the confirm, returns focus to Finish and keeps recording', () => {
	const { store, root, ended } = openConfirm()
	root.keep.onclick()
	assert.equal(ended.count, 0)
	assert.equal(store.finishConfirmOpen, false)
	assert.equal(store.indicatorState, 'recording')
	assert.equal(root.confirm.hidden, true)
	assert.equal(root.parts['.finish-btn'].getAttribute('aria-expanded'), 'false')
	assert.equal(focused, root.parts['.finish-btn'])
})

test('Escape closes the confirm without ending the test', () => {
	const { store, root, ended } = openConfirm()
	root.confirm.onkeydown(key('Escape'))
	assert.equal(ended.count, 0)
	assert.equal(store.finishConfirmOpen, false)
	assert.equal(root.confirm.hidden, true)
	assert.equal(focused, root.parts['.finish-btn'])
})

test('Tab keeps focus inside the confirm', () => {
	const { root } = openConfirm()
	const tab = key('Tab')
	root.confirm.onkeydown(tab)
	assert.equal(tab.prevented, true)
	assert.equal(focused, root.yes)
	root.confirm.onkeydown(key('Tab'))
	assert.equal(focused, root.keep)
})

test('a tap outside closes the confirm; taps on the confirm or Finish do not', () => {
	const { store, root, ended } = openConfirm()
	finishConfirmPointer(store, [root.keep, root.confirm, {}])
	finishConfirmPointer(store, [root.parts['.finish-btn'], {}])
	assert.equal(store.finishConfirmOpen, true)
	finishConfirmPointer(store, [{}, {}])
	assert.equal(store.finishConfirmOpen, false)
	assert.equal(root.confirm.hidden, true)
	assert.equal(ended.count, 0)
})

test('tapping Finish on the bar again closes the confirm', () => {
	const { store, end, ended } = openConfirm()
	finishTap(store, end)
	assert.equal(store.finishConfirmOpen, false)
	assert.equal(ended.count, 0)
})

test('Finish in the confirm ends the test once and closes the confirm', () => {
	const { store, root, ended } = openConfirm()
	root.yes.onclick()
	assert.equal(ended.count, 1)
	assert.equal(store.finishConfirmOpen, false)
	assert.equal(root.confirm.hidden, true)
})

test('Retry after a failed save is one tap, with no confirm', () => {
	const store = makeStore({ indicatorState: 'error' })
	let ended = 0
	finishTap(store, () => { ended++ })
	assert.equal(ended, 1)
	assert.equal(store.finishConfirmOpen, false)
	assert.equal(store.indicatorRoot.confirm.hidden, true)
})
