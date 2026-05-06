// Smoke test for OS color-scheme auto-detection.
// Connects to the running Chrome on CDP 9222 in a fresh context (we control
// emulateMedia, no auth needed) and asserts the panel background matches.

import { chromium } from '/Users/willy/projects/feedback/node_modules/playwright/index.mjs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = path.join(__dirname, 'screenshots')
const BASE = 'http://localhost:8765/examples'

function rgbToHex(rgb) {
	const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
	if (!m) return rgb
	const [, r, g, b] = m
	const hex = n => Number(n).toString(16).padStart(2, '0')
	return `#${hex(r)}${hex(g)}${hex(b)}`
}

async function getPanelBg(page) {
	return await page.evaluate(() => {
		const host = document.querySelector('[data-usero-widget]')
		if (!host || !host.shadowRoot) return null
		const panel = host.shadowRoot.querySelector('.fb-pnl-base')
		if (!panel) return null
		return getComputedStyle(panel).backgroundColor
	})
}

async function openPanel(page) {
	await page.evaluate(() => {
		const host = document.querySelector('[data-usero-widget]')
		const btn = host?.shadowRoot?.querySelector('.fb-btn')
		btn?.click()
	})
	await page.waitForTimeout(400)
}

async function run() {
	const browser = await chromium.connectOverCDP('http://localhost:9222')
	// Use a fresh context so emulateMedia takes effect cleanly. No auth needed.
	const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } })
	const results = []

	try {
		// Test 1: dark mode auto
		{
			const page = await ctx.newPage()
			await page.emulateMedia({ colorScheme: 'dark' })
			await page.goto(`${BASE}/vanilla.html`)
			await page.waitForTimeout(300)
			await openPanel(page)
			const bg = await getPanelBg(page)
			const hex = rgbToHex(bg ?? '')
			const pass = hex === '#1f2937'
			results.push({ name: 'dark-auto', pass, bg, hex, expected: '#1f2937' })
			await page.screenshot({ path: path.join(SHOTS, 'dark-auto.png') })
			await page.close()
		}

		// Test 2: light mode auto
		{
			const page = await ctx.newPage()
			await page.emulateMedia({ colorScheme: 'light' })
			await page.goto(`${BASE}/vanilla.html`)
			await page.waitForTimeout(300)
			await openPanel(page)
			const bg = await getPanelBg(page)
			const hex = rgbToHex(bg ?? '')
			const pass = hex === '#ffffff'
			results.push({ name: 'light-auto', pass, bg, hex, expected: '#ffffff' })
			await page.screenshot({ path: path.join(SHOTS, 'light-auto.png') })
			await page.close()
		}

		// Test 3: dark -> light live swap
		{
			const page = await ctx.newPage()
			await page.emulateMedia({ colorScheme: 'dark' })
			await page.goto(`${BASE}/vanilla.html`)
			await page.waitForTimeout(300)
			await openPanel(page)
			const bgDark = rgbToHex((await getPanelBg(page)) ?? '')
			await page.emulateMedia({ colorScheme: 'light' })
			await page.waitForTimeout(300)
			const bgLight = rgbToHex((await getPanelBg(page)) ?? '')
			const pass = bgDark === '#1f2937' && bgLight === '#ffffff'
			results.push({
				name: 'dark-to-light-live',
				pass,
				bgDark,
				bgLight,
			})
			await page.screenshot({ path: path.join(SHOTS, 'dark-to-light-live.png') })
			await page.close()
		}

		// Test 4: explicit theme overrides OS
		{
			const page = await ctx.newPage()
			await page.emulateMedia({ colorScheme: 'light' })
			await page.goto(`${BASE}/vanilla-explicit-dark.html`)
			await page.waitForTimeout(300)
			await openPanel(page)
			const bg = await getPanelBg(page)
			const hex = rgbToHex(bg ?? '')
			const pass = hex === '#1f2937'
			results.push({
				name: 'explicit-theme-overrides',
				pass,
				bg,
				hex,
				expected: '#1f2937 (dark, despite OS=light)',
			})
			await page.screenshot({
				path: path.join(SHOTS, 'explicit-theme-overrides.png'),
			})
			await page.close()
		}
	} finally {
		// Don't call browser.close() / disconnect — the CDP connection drops
		// when the node process exits. Just close our own context.
		try { await ctx.close() } catch {}
	}

	console.log(JSON.stringify(results, null, 2))
	const allPass = results.every(r => r.pass)
	process.exit(allPass ? 0 : 1)
}

run().catch(err => {
	console.error(err)
	process.exit(1)
})
