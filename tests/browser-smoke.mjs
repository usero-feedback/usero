// Browser smoke test for the Usero vanilla widget.
// Connects to the user's existing Chrome via CDP, runs through the full
// widget UX, captures screenshots and the network request, and reports
// every step's pass/fail.

import { chromium } from '/Users/willy/projects/feedback/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHOTS = `${__dirname}/screenshots`
mkdirSync(SHOTS, { recursive: true })

const URL = 'http://localhost:8765/examples/vanilla.html'
const results = []
function record(step, status, note = '') {
	results.push({ step, status, note })
	const icon = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : 'NOTE'
	console.log(`[${icon}] ${step}${note ? ' — ' + note : ''}`)
}

const browser = await chromium.connectOverCDP('http://localhost:9222')
const ctx = browser.contexts()[0]
const page = await ctx.newPage()

const consoleErrors = []
const pageErrors = []
page.on('console', msg => {
	if (msg.type() !== 'error') return
	const text = msg.text()
	// Ignore favicon 404, that's host page noise, not a widget bug.
	if (/favicon\.ico/i.test(text)) return
	consoleErrors.push(text)
})
page.on('requestfailed', req => {
	if (/favicon\.ico/i.test(req.url())) return
	consoleErrors.push(`requestfailed ${req.url()}: ${req.failure()?.errorText}`)
})
page.on('pageerror', err => pageErrors.push(err.message))

// Capture the feedback POST
let feedbackRequest = null
page.on('request', req => {
	if (req.url().includes('/api/feedback') && req.method() === 'POST') {
		feedbackRequest = {
			url: req.url(),
			method: req.method(),
			headers: req.headers(),
			postData: req.postData(),
		}
	}
})

try {
	// 1. Navigate
	const resp = await page.goto(URL, { waitUntil: 'networkidle' })
	if (resp && resp.ok()) record('1. Navigate to example page', 'pass', `status ${resp.status()}`)
	else record('1. Navigate to example page', 'fail', `status ${resp?.status()}`)

	// Give the IIFE a beat to mount.
	await page.waitForTimeout(300)

	if (consoleErrors.length === 0 && pageErrors.length === 0) {
		record('1b. No console/pageerror', 'pass')
	} else {
		record('1b. No console/pageerror', 'fail',
			`console=${JSON.stringify(consoleErrors)} pageerrors=${JSON.stringify(pageErrors)}`)
	}

	// 2. Trigger button visible (host div itself is `display:inline`/empty so
	// don't use waitFor visible — instead poll for the shadow root + button).
	await page.waitForFunction(() => {
		const host = document.querySelector('div[data-usero-widget]')
		return !!host?.shadowRoot?.querySelector('.fb-btn')
	}, null, { timeout: 3000 })
	const triggerVisible = await page.evaluate(() => {
		const host = document.querySelector('div[data-usero-widget]')
		if (!host || !host.shadowRoot) return { ok: false, reason: 'no shadow root' }
		const btn = host.shadowRoot.querySelector('.fb-btn')
		if (!btn) return { ok: false, reason: 'no .fb-btn' }
		const rect = btn.getBoundingClientRect()
		const cs = getComputedStyle(btn)
		return {
			ok: rect.width > 0 && rect.height > 0 && cs.display !== 'none',
			rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
			classes: btn.className,
		}
	})
	if (triggerVisible.ok) record('2. Trigger visible bottom-right', 'pass', JSON.stringify(triggerVisible))
	else record('2. Trigger visible bottom-right', 'fail', JSON.stringify(triggerVisible))

	// 3. Screenshot closed state
	await page.screenshot({ path: `${SHOTS}/01-closed.png`, fullPage: false })
	record('3. Screenshot closed', 'pass', '01-closed.png')

	// 4. Click trigger
	await page.evaluate(() => {
		const host = document.querySelector('div[data-usero-widget]')
		const btn = host.shadowRoot.querySelector('.fb-btn')
		btn.click()
	})
	await page.waitForTimeout(400)
	const openCheck = await page.evaluate(() => {
		const host = document.querySelector('div[data-usero-widget]')
		const sr = host.shadowRoot
		const panel = sr.querySelector('.fb-pnl-base')
		const ratings = sr.querySelectorAll('button[data-rating]')
		const ta = sr.querySelector('textarea[data-role="comment"]')
		return {
			panelOpen: panel?.className.includes('fb-pnl--open') ?? false,
			ratings: ratings.length,
			ta: !!ta,
		}
	})
	if (openCheck.panelOpen && openCheck.ratings === 4 && openCheck.ta) {
		record('4. Click trigger opens panel', 'pass', JSON.stringify(openCheck))
	} else {
		record('4. Click trigger opens panel', 'fail', JSON.stringify(openCheck))
	}

	// 5. Screenshot open
	await page.screenshot({ path: `${SHOTS}/02-open.png` })
	record('5. Screenshot open', 'pass', '02-open.png')

	// 6. Click rating "loved it" (rating=4)
	await page.evaluate(() => {
		const host = document.querySelector('div[data-usero-widget]')
		const btn = host.shadowRoot.querySelector('button[data-rating="4"]')
		btn.click()
	})
	await page.waitForTimeout(200)
	const ratingState = await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		const wrapper = sr.querySelector('button[data-rating="4"]')?.closest('.fb-ec')
		return {
			selected: wrapper?.className.includes('fb-ec--sel') ?? false,
			ariaChecked: sr.querySelector('button[data-rating="4"]')?.getAttribute('aria-checked'),
		}
	})
	if (ratingState.selected && ratingState.ariaChecked === 'true') {
		record('6. Rating shows selected state', 'pass', JSON.stringify(ratingState))
	} else {
		record('6. Rating shows selected state', 'fail', JSON.stringify(ratingState))
	}

	// 7. Type comment
	const COMMENT = 'Smoke test comment from Playwright'
	await page.evaluate(text => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		const ta = sr.querySelector('textarea[data-role="comment"]')
		ta.focus()
		ta.value = text
		ta.dispatchEvent(new Event('input', { bubbles: true }))
	}, COMMENT)
	await page.waitForTimeout(150)
	const commentRead = await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		return sr.querySelector('textarea[data-role="comment"]').value
	})
	if (commentRead === COMMENT) record('7. Type comment', 'pass')
	else record('7. Type comment', 'fail', `got=${commentRead}`)

	// 8. Screenshot filled
	await page.screenshot({ path: `${SHOTS}/03-filled.png` })
	record('8. Screenshot filled', 'pass', '03-filled.png')

	// 9. Submit
	feedbackRequest = null
	await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		const submit = sr.querySelector('button.fb-sub')
		submit.click()
	})
	// wait for the network call
	await page.waitForTimeout(2500)
	if (feedbackRequest) {
		let parsed = null
		try { parsed = JSON.parse(feedbackRequest.postData ?? '') } catch {}
		const okShape =
			feedbackRequest.url === 'https://usero.io/api/feedback' &&
			parsed &&
			parsed.clientId === 'demo-client-id' &&
			parsed.rating === 4 &&
			parsed.comment === COMMENT
		if (okShape) record('9. POST /api/feedback well-formed', 'pass', JSON.stringify(parsed))
		else record('9. POST /api/feedback well-formed', 'fail', JSON.stringify({ url: feedbackRequest.url, parsed }))
	} else {
		record('9. POST /api/feedback well-formed', 'fail', 'no request captured')
	}

	// 10. Failed-response UI graceful
	const errMsgState = await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		const errEl = sr.querySelector('.fb-msg--err')
		const okEl = sr.querySelector('.fb-msg--ok')
		const panel = sr.querySelector('.fb-pnl-base')
		return {
			panelStillOpen: panel?.className.includes('fb-pnl--open') ?? false,
			errText: errEl?.textContent?.trim() ?? null,
			okText: okEl?.textContent?.trim() ?? null,
		}
	})
	// Either we got an err message OR an ok message; the panel must still be intact.
	if (errMsgState.panelStillOpen && (errMsgState.errText || errMsgState.okText)) {
		record('10. Failed response handled gracefully', 'pass', JSON.stringify(errMsgState))
	} else {
		record('10. Failed response handled gracefully', 'fail', JSON.stringify(errMsgState))
	}

	// 10b. Force-fail path: stub fetch to reject and confirm error UI renders.
	await page.evaluate(() => {
		document.querySelectorAll('div[data-usero-widget]').forEach(n => n.remove())
		const realFetch = window.fetch.bind(window)
		window.__realFetch = realFetch
		window.fetch = (input, init) => {
			const url = typeof input === 'string' ? input : input.url
			if (url.includes('/api/feedback')) {
				return Promise.reject(new Error('Simulated network failure'))
			}
			return realFetch(input, init)
		}
		window.Usero.initUseroFeedbackWidget({
			clientId: 'demo-client-id',
			position: 'right',
		})
	})
	await page.waitForTimeout(200)
	await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		sr.querySelector('.fb-btn').click()
	})
	await page.waitForTimeout(200)
	await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		sr.querySelector('button[data-rating="2"]').click()
	})
	await page.waitForTimeout(150)
	await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		sr.querySelector('button.fb-sub').click()
	})
	await page.waitForTimeout(2000)
	const errState = await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		const errEl = sr.querySelector('.fb-msg--err')
		const okEl = sr.querySelector('.fb-msg--ok')
		const panel = sr.querySelector('.fb-pnl-base')
		return {
			panelStillOpen: panel?.className.includes('fb-pnl--open') ?? false,
			errText: errEl?.textContent?.trim() ?? null,
			okText: okEl?.textContent?.trim() ?? null,
		}
	})
	if (errState.panelStillOpen && errState.errText && !errState.okText) {
		record('10b. Network failure shows error UI', 'pass', JSON.stringify(errState))
	} else {
		record('10b. Network failure shows error UI', 'fail', JSON.stringify(errState))
	}
	// Restore fetch and re-init clean widget
	await page.evaluate(() => {
		document.querySelectorAll('div[data-usero-widget]').forEach(n => n.remove())
		if (window.__realFetch) window.fetch = window.__realFetch
		window.Usero.initUseroFeedbackWidget({
			clientId: 'demo-client-id',
			position: 'right',
		})
	})
	await page.waitForTimeout(200)

	// 11a. Close button (X) — open panel first since we re-inited
	await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		sr.querySelector('.fb-btn').click()
	})
	await page.waitForTimeout(200)
	await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		const x = sr.querySelector('button[data-role="close"]')
		x.click()
	})
	await page.waitForTimeout(200)
	let closedAfterX = await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		return !sr.querySelector('.fb-pnl-base')?.className.includes('fb-pnl--open')
	})
	record('11a. X close button closes panel', closedAfterX ? 'pass' : 'fail')

	// 11b. Backdrop click
	await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		sr.querySelector('.fb-btn').click()
	})
	await page.waitForTimeout(200)
	await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		sr.querySelector('.fb-backdrop').click()
	})
	await page.waitForTimeout(200)
	const closedAfterBackdrop = await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		return !sr.querySelector('.fb-pnl-base')?.className.includes('fb-pnl--open')
	})
	record('11b. Backdrop click closes', closedAfterBackdrop ? 'pass' : 'fail')

	// 12. Esc closes
	await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		sr.querySelector('.fb-btn').click()
	})
	await page.waitForTimeout(200)
	await page.keyboard.press('Escape')
	await page.waitForTimeout(200)
	const closedAfterEsc = await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		return !sr.querySelector('.fb-pnl-base')?.className.includes('fb-pnl--open')
	})
	record('12. Esc key closes', closedAfterEsc ? 'pass' : 'fail')

	// 13. Mobile viewport
	await page.setViewportSize({ width: 375, height: 667 })
	await page.waitForTimeout(150)
	// Open it
	await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		sr.querySelector('.fb-btn').click()
	})
	await page.waitForTimeout(300)
	const mobileMetrics = await page.evaluate(() => {
		const sr = document.querySelector('div[data-usero-widget]').shadowRoot
		const panel = sr.querySelector('.fb-pnl-base')
		const rect = panel.getBoundingClientRect()
		const btn = sr.querySelector('.fb-btn').getBoundingClientRect()
		const cs = getComputedStyle(panel)
		return {
			vw: window.innerWidth,
			vh: window.innerHeight,
			panel: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
			// Allow ~2px subpixel slop from transform compositing
			panelOverflow: rect.x < -2 || rect.right > window.innerWidth + 2,
			btn: { x: btn.x, y: btn.y, w: btn.width, h: btn.height, right: btn.right },
			cssWidth: cs.width,
			cssMaxWidth: cs.maxWidth,
		}
	})
	await page.screenshot({ path: `${SHOTS}/04-mobile.png` })
	record('13. Mobile viewport metrics', 'note', JSON.stringify(mobileMetrics))
	if (mobileMetrics.panelOverflow) {
		record('13b. Mobile panel overflow', 'fail', 'panel extends past viewport')
	} else {
		record('13b. Mobile panel overflow', 'pass')
	}

	// Final: dump leftover console / page errors
	if (consoleErrors.length || pageErrors.length) {
		record('Z. Errors during run', 'note',
			`console=${JSON.stringify(consoleErrors)} pageerrors=${JSON.stringify(pageErrors)}`)
	}
} catch (err) {
	record('FATAL', 'fail', err.stack ?? String(err))
} finally {
	// Don't call browser.close() — that can kill the user's Chrome. Closing
	// our own page is enough; the CDP connection drops when the node process
	// exits.
	try { await page.close() } catch {}
}

console.log('\n=== SUMMARY ===')
const pass = results.filter(r => r.status === 'pass').length
const fail = results.filter(r => r.status === 'fail').length
const note = results.filter(r => r.status === 'note').length
console.log(`pass=${pass} fail=${fail} note=${note}`)
process.exit(fail > 0 ? 1 : 0)
