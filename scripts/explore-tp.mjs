#!/usr/bin/env node
import { chromium } from '/Users/willy/projects/feedback/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const OUT = join(homedir(), 'projects/usero/scripts/output')
mkdirSync(OUT, { recursive: true })

const browser = await chromium.connectOverCDP('http://localhost:9222')
const ctx = browser.contexts()[0]
const page = await ctx.newPage()

const urls = [
	// org-level
	'https://www.npmjs.com/settings/usero/trusted-publishers',
	'https://www.npmjs.com/settings/usero/packages',
	'https://www.npmjs.com/settings/usero',
	'https://www.npmjs.com/org/usero',
	// existing-package access (leboost is published via GH Actions, so it has TP)
	'https://www.npmjs.com/package/leboost/access',
]

for (const u of urls) {
	const r = await page.goto(u, { waitUntil: 'domcontentloaded' }).catch(e => ({ status: () => 'err:' + e.message }))
	await page.waitForTimeout(1500)
	const status = typeof r?.status === 'function' ? r.status() : r
	const finalUrl = page.url()
	const txt = await page.locator('body').innerText().catch(() => '')
	const tpMatch = (txt.match(/trusted publish[a-z ]*/gi) ?? []).slice(0, 3)
	console.log(JSON.stringify({ requested: u, status, finalUrl, tpMatch }))
	const slug = u.replace(/[^a-z0-9]/gi, '_').slice(-50)
	await page.screenshot({ path: join(OUT, `explore-${slug}.png`), fullPage: true })
}

await page.close()
if (typeof browser.disconnect === 'function') await browser.disconnect()
