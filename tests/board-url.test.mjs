// boardUrl(): the link a host app uses to open its Usero board with custom field answers pre-filled.
//
// Run with: node --test tests/board-url.test.mjs

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const { boardUrl } = await import('../dist/board.js')

test('defaults to the submit page on usero.io', () => {
	assert.equal(boardUrl({ board: 'acme' }), 'https://usero.io/b/acme/submit')
})

test('home path opens the board itself', () => {
	assert.equal(boardUrl({ board: 'acme', path: 'home', fields: { Plan: 'Pro' } }), 'https://usero.io/b/acme?field.Plan=Pro')
})

test('encodes field keys and values, and the email', () => {
	const url = boardUrl({
		board: 'acme',
		fields: { 'Company size': '11-50 & up', cf_abc12: 'Pro' },
		email: 'ada+test@example.com',
	})
	assert.equal(
		url,
		'https://usero.io/b/acme/submit?field.Company+size=11-50+%26+up&field.cf_abc12=Pro&email=ada%2Btest%40example.com',
	)
	const params = new URL(url).searchParams
	assert.equal(params.get('field.Company size'), '11-50 & up')
	assert.equal(params.get('email'), 'ada+test@example.com')
})

test('stringifies numbers and booleans and skips null, undefined and empty values', () => {
	const url = boardUrl({
		board: 'acme',
		fields: { Seats: 25, Beta: true, Off: false, Gone: null, Missing: undefined, Blank: '  ', Zero: 0 },
		email: '  ',
	})
	assert.equal(url, 'https://usero.io/b/acme/submit?field.Seats=25&field.Beta=true&field.Off=false&field.Zero=0')
})

test('keeps the /b/<slug> path on a custom domain and drops a trailing slash', () => {
	assert.equal(
		boardUrl({ board: 'acme', baseUrl: 'https://feedback.acme.com/', fields: { Plan: 'Pro' } }),
		'https://feedback.acme.com/b/acme/submit?field.Plan=Pro',
	)
})

test('the widget entries and the script tag do not carry it', async () => {
	const vanilla = await import('../dist/vanilla.js')
	assert.equal('boardUrl' in vanilla, false)
	const source = await readFile(new URL('../dist/usero.iife.js', import.meta.url), 'utf8')
	assert.equal(source.includes('boardUrl'), false)
})
