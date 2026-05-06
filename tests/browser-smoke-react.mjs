// Browser smoke test for the Usero React wrapper. Mirrors browser-smoke.mjs
// but loads the React entry via examples/react.html.

import { chromium } from '/Users/willy/projects/feedback/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOTS = `${__dirname}/screenshots`
mkdirSync(SHOTS, { recursive: true })

const URL = 'http://localhost:8765/examples/react.html'
const results = []
function record(step, status, note = '') {
	results.push({ step, status, note })
	const icon = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'NOTE'
	console.log(`[${icon}] ${step}${note ? ' - ' + note : ''}`)
}

const browser = await chromium.connectOverCDP('http://localhost:9222')
const ctx = browser.contexts()[0]
const page = await ctx.newPage()

const consoleErrors = []
const pageErrors = []
page.on('console', msg => {
	if (msg.type() !== 'error') return
	const text = msg.text()
	if (/favicon\.ico/i.test(text)) return
	consoleErrors.push(text)
})
page.on('requestfailed', req => {
	if (/favicon\.ico/i.test(req.url())) return
	consoleErrors.push(`requestfailed ${req.url()}: ${req.failure()?.errorText}`)
})
page.on('pageerror', err => pageErrors.push(err.message))

let feedbackRequest = null
page.on('request', req => {
	if (req.url().includes('/api/feedback') && req.method() === 'POST') {
		feedbackRequest = {
			url: req.url(),
			method: req.method(),
			postData: req.postData(),
		}
	}
})

try {
	const resp = await page.goto(URL, { waitUntil: 'networkidle' })
	if (resp && resp.ok()) record('1. Navigate', 'pass', `status ${resp.status()}`)
	else record('1. Navigate', 'fail', `status ${resp?.status()}`)

	// Wait for the wrapper's useEffect to run and mount the widget host.
	await page.waitForFunction(() => {
		const host = document.querySelector('div[data-usero-widget]')
		return !!host?.shadowRoot?.querySelector('.fb-btn')
	}, null, { timeout: 5000 })

	if (consoleErrors.length === 0 && pageErrors.length === 0) {
		record('1b. No console/pageerror', 'pass')
	} else {
		record('1b. No console/pageerror', 'fail',
			`console=${JSON.stringify(consoleErrors)} pageerrors=${JSON.stringify(pageErrors)}`)
	}

	const triggerVisible = await page.evaluate(() => {
		const host = document.querySelector('div[data-usero-widget]')
		if (!host || !host.shadowRoot) return { ok: false, reason: 'no shadow root' }
		const btn = host.shadowRoot.querySelector('.fb-btn')
		if (!btn) return { ok: false, reason: 'no .fb-btn' }
		const rect = btn.getBoundingClientRect()
		return { ok: rect.width > 0 && rect.height > 0 }
	})
	if (triggerVisible.ok) record('2. Trigger visible', 'pass')
	else record('2. Trigger visible', 'fail', JSON.stringify(triggerVisible))

	await page.screenshot({ path: `${SHOTS}/react-01-closed.png` })

	// Open
	await page.evaluate(() => {
		document.querySelector('div[data-usero-widget]').shadowRoot.querySelector('.fb-btn').click()
	})
	await page.waitForTimeout(300)
	const openCheck = await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		const panel = sr.querySelector('.fb-pnl-base')
		return {
			panelOpen: panel?.className.includes('fb-pnl--open') ?? false,
			ratings: sr.querySelectorAll('button[data-rating]').length,
			ta: !!sr.querySelector('textarea[data-role="comment"]'),
		}
	})
	if (openCheck.panelOpen && openCheck.ratings === 4 && openCheck.ta) {
		record('3. Open panel', 'pass', JSON.stringify(openCheck))
	} else {
		record('3. Open panel', 'fail', JSON.stringify(openCheck))
	}
	await page.screenshot({ path: `${SHOTS}/react-02-open.png` })

	// Pick rating
	await page.evaluate(() => {
		document.querySelector('div[data-usero-widget]').shadowRoot
			.querySelector('button[data-rating="4"]').click()
	})
	await page.waitForTimeout(150)

	// Type comment
	const COMMENT = 'React wrapper smoke test comment'
	await page.evaluate(text => {
		const ta = document.querySelector('div[data-usero-widget]').shadowRoot
			.querySelector('textarea[data-role="comment"]')
		ta.focus()
		ta.value = text
		ta.dispatchEvent(new Event('input', { bubbles: true }))
	}, COMMENT)
	await page.waitForTimeout(150)
	await page.screenshot({ path: `${SHOTS}/react-03-filled.png` })

	// Submit
	feedbackRequest = null
	await page.evaluate(() => {
		document.querySelector('div[data-usero-widget]').shadowRoot
			.querySelector('button.fb-sub').click()
	})
	await page.waitForTimeout(2500)
	if (feedbackRequest) {
		let parsed = null
		try { parsed = JSON.parse(feedbackRequest.postData ?? '') } catch {}
		const okShape =
			feedbackRequest.url === 'https://usero.io/api/feedback' &&
			parsed && parsed.clientId === 'demo-client-id' &&
			parsed.rating === 4 && parsed.comment === COMMENT
		if (okShape) record('4. POST /api/feedback', 'pass', JSON.stringify(parsed))
		else record('4. POST /api/feedback', 'fail', JSON.stringify({ url: feedbackRequest.url, parsed }))
	} else {
		record('4. POST /api/feedback', 'fail', 'no request captured')
	}

	// Close via X
	await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		// re-open if it auto-closed
		if (!sr.querySelector('.fb-pnl-base')?.className.includes('fb-pnl--open')) {
			sr.querySelector('.fb-btn').click()
		}
	})
	await page.waitForTimeout(150)
	await page.evaluate(() => {
		document.querySelector('div[data-usero-widget]').shadowRoot
			.querySelector('button[data-role="close"]').click()
	})
	await page.waitForTimeout(200)
	const closed = await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		return !sr.querySelector('.fb-pnl-base')?.className.includes('fb-pnl--open')
	})
	record('5. X close button closes', closed ? 'pass' : 'fail')

	// Esc closes
	await page.evaluate(() => {
		document.querySelector('div[data-usero-widget]').shadowRoot.querySelector('.fb-btn').click()
	})
	await page.waitForTimeout(150)
	await page.keyboard.press('Escape')
	await page.waitForTimeout(200)
	const closedEsc = await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		return !sr.querySelector('.fb-pnl-base')?.className.includes('fb-pnl--open')
	})
	record('6. Esc closes', closedEsc ? 'pass' : 'fail')

	// React unmount cleans up the host
	await page.evaluate(() => {
		// We don't actually unmount in the example, but we can verify the
		// destroy hook works by simulating it via the React root if exposed.
		// Just verify host count is 1 (no double-mount from StrictMode/etc).
		return document.querySelectorAll('div[data-usero-widget]').length
	}).then(n => {
		if (n === 1) record('7. Single host element', 'pass')
		else record('7. Single host element', 'fail', `count=${n}`)
	})

	if (consoleErrors.length || pageErrors.length) {
		record('Z. Errors during run', 'note',
			`console=${JSON.stringify(consoleErrors)} pageerrors=${JSON.stringify(pageErrors)}`)
	}
} catch (err) {
	record('FATAL', 'fail', err.stack ?? String(err))
} finally {
	try { await page.close() } catch {}
	try { await browser.disconnect() } catch {}
}

console.log('\n=== SUMMARY ===')
const pass = results.filter(r => r.status === 'pass').length
const fail = results.filter(r => r.status === 'fail').length
console.log(`pass=${pass} fail=${fail}`)
process.exit(fail > 0 ? 1 : 0)
