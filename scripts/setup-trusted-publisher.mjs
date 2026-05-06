#!/usr/bin/env node
// Configure a Trusted Publisher on npmjs.com for the unpublished `usero` package.
// Connects to existing Chrome on CDP 9222 (user already logged into npm).

import { chromium } from '/Users/willy/projects/feedback/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const OUT = join(homedir(), 'projects/usero/scripts/output')
mkdirSync(OUT, { recursive: true })

const shot = (page, name) => page.screenshot({ path: join(OUT, name), fullPage: true })

const log = (...a) => console.log('[npm-tp]', ...a)

async function main() {
	const browser = await chromium.connectOverCDP('http://localhost:9222')
	const ctx = browser.contexts()[0]
	if (!ctx) throw new Error('No existing browser context found')
	const page = await ctx.newPage()

	try {
		// Step 1: confirm logged in
		log('navigating to npmjs.com')
		await page.goto('https://www.npmjs.com/', { waitUntil: 'domcontentloaded' })
		await page.waitForTimeout(1500)
		await shot(page, '01-npm-home.png')

		// Look for a profile/avatar link — npm uses /~username
		const profileLink = page.locator('a[href^="/~"]').first()
		const loggedIn = (await profileLink.count()) > 0
		let username = null
		if (loggedIn) {
			const href = await profileLink.getAttribute('href').catch(() => null)
			if (href && href.startsWith('/~')) username = href.slice(2).split(/[/?#]/)[0]
			log('logged in as:', username ?? '(unknown user, profile link present)')
		}
		if (!username) {
			// Try /settings — it redirects to /settings/<username>/...
			const r = await page.goto('https://www.npmjs.com/settings', { waitUntil: 'domcontentloaded' }).catch(() => null)
			await page.waitForTimeout(1000)
			const finalUrl = page.url()
			log('settings redirect URL:', finalUrl)
			const m = finalUrl.match(/\/settings\/([^/]+)/)
			if (m) username = decodeURIComponent(m[1])
			log('extracted username:', username)
		}
		if (!loggedIn && !username) {
			log('NOT logged in — stopping')
			await shot(page, '01b-not-logged-in.png')
			return { ok: false, reason: 'not-logged-in' }
		}

		// Step 2: try direct package access page
		log('trying /package/usero/access')
		const resp = await page.goto('https://www.npmjs.com/package/usero/access', {
			waitUntil: 'domcontentloaded',
		})
		await page.waitForTimeout(1500)
		await shot(page, '02-package-access.png')
		log('status:', resp?.status())

		// If we got a real access page, look for trusted publisher controls
		const pageText = await page.locator('body').innerText().catch(() => '')
		const hasTrustedPub = /trusted publisher/i.test(pageText)
		log('access page mentions Trusted Publisher?', hasTrustedPub)

		if (resp && resp.status() === 404) {
			log('package not published — falling back to account settings')
		}

		// Step 3: account-level trusted publishers page
		// npm has an account-level trusted publishers settings page
		const candidates = [
			username ? `https://www.npmjs.com/settings/${username}/trusted-publishers` : null,
			username ? `https://www.npmjs.com/settings/${username}/packages` : null,
			'https://www.npmjs.com/settings/trusted-publishers',
		].filter(Boolean)

		let landed = null
		for (const url of candidates) {
			log('trying', url)
			const r = await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => null)
			await page.waitForTimeout(1200)
			const status = r?.status()
			log('  status', status)
			if (status && status < 400) {
				landed = url
				await shot(page, `03-settings-${url.split('/').pop()}.png`)
				const txt = await page.locator('body').innerText().catch(() => '')
				if (/trusted publisher/i.test(txt)) {
					log('  page mentions Trusted Publisher')
					break
				}
			}
		}
		log('landed at:', landed)

		// Step 4: look for an Add / New trusted publisher button
		await page.waitForTimeout(500)
		const addBtnCandidates = [
			'a:has-text("Add trusted publisher")',
			'button:has-text("Add trusted publisher")',
			'a:has-text("Add Trusted Publisher")',
			'a:has-text("New trusted publisher")',
			'button:has-text("Add")',
			'a:has-text("Trusted Publishers")',
		]
		let clicked = false
		for (const sel of addBtnCandidates) {
			const el = page.locator(sel).first()
			if ((await el.count()) > 0) {
				log('clicking', sel)
				await el.click().catch(e => log('  click failed', e.message))
				await page.waitForTimeout(1500)
				await shot(page, `04-after-click-${sel.replace(/[^a-z]/gi, '_').slice(0, 30)}.png`)
				clicked = true
				break
			}
		}
		if (!clicked) log('no obvious Add button found')

		await shot(page, '05-form-or-state.png')

		// Step 5: try to fill the form if visible
		const fields = {
			package: ['input[name="package"]', 'input[name="packageName"]', 'input[placeholder*="package" i]'],
			org: ['input[name="organization"]', 'input[name="owner"]', 'input[placeholder*="organization" i]', 'input[placeholder*="owner" i]'],
			repo: ['input[name="repository"]', 'input[name="repo"]', 'input[placeholder*="repository" i]'],
			workflow: ['input[name="workflow"]', 'input[name="workflowFilename"]', 'input[placeholder*="workflow" i]'],
		}
		const tryFill = async (key, val) => {
			for (const sel of fields[key]) {
				const el = page.locator(sel).first()
				if ((await el.count()) > 0) {
					log(`filling ${key} via ${sel}`)
					await el.fill(val).catch(e => log('  fill failed', e.message))
					return true
				}
			}
			log(`no input found for ${key}`)
			return false
		}

		await tryFill('package', 'usero')
		await tryFill('org', 'usero-feedback')
		await tryFill('repo', 'usero')
		await tryFill('workflow', 'publish.yml')
		await page.waitForTimeout(500)
		await shot(page, '06-form-filled.png')

		log('STOPPING before submit so a human can verify. Re-run with SUBMIT=1 to submit.')
		if (process.env.SUBMIT === '1') {
			const submit = page.locator('button[type="submit"], button:has-text("Add"), button:has-text("Save"), button:has-text("Create")').first()
			if ((await submit.count()) > 0) {
				log('submitting')
				await submit.click()
				await page.waitForTimeout(3000)
				await shot(page, '07-after-submit.png')
				await page.screenshot({ path: join(OUT, 'trusted-publisher-configured.png'), fullPage: true })
			} else {
				log('no submit button found')
			}
		}

		return { ok: true, username, landed }
	} catch (err) {
		log('ERROR', err.message)
		try { await shot(page, '99-error.png') } catch {}
		throw err
	} finally {
		if (typeof browser.disconnect === 'function') await browser.disconnect()
	}
}

main().then(r => log('done', JSON.stringify(r))).catch(e => { console.error(e); process.exit(1) })
