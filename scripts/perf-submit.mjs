#!/usr/bin/env node
// Submit latency harness: `npm run perf`. Docs: docs/PERFORMANCE.md.
//
// Boots a static host page + a cross-origin mock API, drives the real widget
// in Playwright's own headless Chromium with CDP throttling (250 ms latency,
// mobile bandwidth, 4x CPU), and measures click -> feedback POST, click ->
// success UI and main-thread long tasks for live-recording, snapshot and ask
// modes. Prints medians and exits non-zero over budget.
//
// Flags:
//   --runs N         runs per scenario (default 5)
//   --sdk DIR        built SDK to test (default ./dist), e.g. an older build
//   --scenario NAME  only run one scenario (live | snapshot | ask | resume)
//   --api URL        use a real Usero server instead of the mock (needs --client)
//   --client ID      clientId for --api runs
//   --json FILE      also write every run and the medians as JSON
//   --no-budget      report only, never fail (for baselines)

import { createServer } from 'node:http'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { gunzipSync } from 'node:zlib'
import { chromium } from 'playwright-core'

// Medians on the 1.5.1 build (POST 5-18, success 283-309, long tasks 0,
// capture long task ~135) plus headroom. Raising one needs Will's OK.
const BUDGETS = {
	clickToPostMs: 50,
	clickToSuccessMs: 400,
	longTaskToSuccessMs: 50,
	longTask5sMs: 300,
	// 1.6.1: rrweb's first full snapshot, medians 75 to 101 ms across reruns; a forced second snapshot made it
	// about 1.5x. The widget check's "exactly one full snapshot" is the deterministic guard against that.
	recordLongTaskMs: 140,
	// A return from hidden does no main-thread work: no long task (50 ms or more) on any run.
	returnLongTaskMs: 0,
}

const NETWORK = {
	offline: false,
	latency: 250,
	downloadThroughput: (4 * 1024 * 1024) / 8,
	uploadThroughput: (1.5 * 1024 * 1024) / 8,
}
const CPU_SLOWDOWN = 4

const SCENARIOS = {
	// Ambient recording is live at submit: the id rides in the POST.
	live: { mode: 'always', sampleRate: 1, waitForRecording: true },
	// Always mode but no recording (sampled out): page snapshot path.
	snapshot: { mode: 'always', sampleRate: 0, waitForRecording: false },
	// Ask first: consent prompt, then a consented snapshot.
	ask: { mode: 'ask', sampleRate: 1, waitForRecording: false },
	// App switch: hidden, frozen, shown again; the same session must carry on and link.
	resume: { mode: 'always', sampleRate: 1, waitForRecording: true, appSwitch: true },
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const { values: args } = parseArgs({
	options: {
		runs: { type: 'string', default: '5' },
		sdk: { type: 'string', default: resolve(__dirname, '../dist') },
		scenario: { type: 'string' },
		api: { type: 'string' },
		client: { type: 'string' },
		json: { type: 'string' },
		'no-budget': { type: 'boolean', default: false },
	},
})
const runs = Number(args.runs)
const sdkDir = resolve(args.sdk)
if (args.api && !args.client) throw new Error('--api needs --client')

const CORS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
	'Access-Control-Allow-Headers': '*',
	'Access-Control-Max-Age': '86400',
}

// ---- mock API ---------------------------------------------------------------

const api = { requests: [], nextId: 0 }

function startMockApi() {
	const server = createServer(async (req, res) => {
		const chunks = []
		for await (const c of req) chunks.push(c)
		const raw = Buffer.concat(chunks)
		const url = new URL(req.url ?? '/', 'http://x')
		const entry = { method: req.method, path: url.pathname, at: Date.now(), body: null }
		api.requests.push(entry)
		const json = (status, body) => {
			res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' })
			res.end(JSON.stringify(body))
		}
		if (req.method === 'OPTIONS') {
			res.writeHead(204, CORS)
			res.end()
			return
		}
		if (url.pathname === '/api/feedback' && req.method === 'GET') {
			const mode = (url.searchParams.get('clientId') ?? '').replace(/^perf-/, '')
			json(200, { valid: true, settings: { allowedDomains: [], customization: {}, sessionContext: mode } })
			return
		}
		if (url.pathname === '/api/feedback' && req.method === 'POST') {
			entry.body = JSON.parse(raw.toString('utf8'))
			api.nextId += 1
			entry.feedbackId = `fb-${api.nextId}`
			json(200, { success: true, feedbackId: entry.feedbackId, replayLinkToken: `token-${entry.feedbackId}` })
			return
		}
		if (url.pathname === '/api/replay-sessions' && req.method === 'POST') {
			entry.body = JSON.parse(raw.toString('utf8'))
			api.nextId += 1
			entry.sessionReplayId = `replay-${api.nextId}`
			json(200, { accepted: true, sessionReplayId: entry.sessionReplayId })
			return
		}
		if (/^\/api\/replay-sessions\/[^/]+\/chunks\/\d+$/.test(url.pathname)) entry.raw = raw
		json(200, { ok: true })
	})
	return listen(server)
}

// True when the snapshot serialised the widget or consent prompt. rrweb strips a blocked node's attributes
// and children, so any surviving marker attribute means the node was captured.
function snapshotHasWidget(raw) {
	const bytes = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw
	const events = JSON.parse(bytes.toString('utf8'))
	const markers = ['data-usero-widget', 'data-usero-session-context-consent']
	const visit = node =>
		Boolean(node) &&
		(markers.some(m => node.attributes && m in node.attributes) || (node.childNodes ?? []).some(visit))
	return events.some(e => e.type === 2 && visit(e.data?.node))
}

// ---- host page + SDK files -----------------------------------------------------

const MIME = { '.js': 'text/javascript', '.cjs': 'text/javascript', '.html': 'text/html', '.map': 'application/json' }

// A product listing page: a few thousand nodes and real CSS, so the snapshot
// serialise cost is representative rather than a toy page's.
function hostPage() {
	const cards = Array.from(
		{ length: 240 },
		(_, i) => `<article class="card"><div class="thumb"></div><h3>Product ${i}</h3>
<p>Hand-finished item ${i} with a longer description that wraps over two lines on a phone.</p>
<div class="row"><span class="price">$${(i * 7) % 300}.00</span><button>Add to cart</button></div></article>`,
	).join('\n')
	const rows = Array.from(
		{ length: 120 },
		(_, i) => `<tr><td>Order ${1000 + i}</td><td>Shipped</td><td>${i % 28}/09</td><td>$${i * 3}.50</td></tr>`,
	).join('\n')
	return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Shop</title><style>
body{font:15px/1.4 system-ui;margin:0;color:#222}header,nav{padding:12px 16px;background:#f4efe8}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;padding:16px}
.card{border:1px solid #ddd;border-radius:8px;padding:8px}.thumb{height:90px;background:#e9e2d8;border-radius:6px}
.row{display:flex;justify-content:space-between;align-items:center}table{width:100%;border-collapse:collapse}
td{border-bottom:1px solid #eee;padding:4px 8px}
</style></head><body><header><h1>Shop</h1></header>
<nav>${['Home', 'New', 'Sale', 'Orders', 'Help'].map(n => `<a href="#">${n}</a>`).join(' ')}</nav>
<main><section class="grid">${cards}</section><table>${rows}</table></main>
<script type="module">
const p = new URLSearchParams(location.search)
const { initUseroFeedbackWidget } = await import('/sdk/vanilla.js')
const { sessionReplay } = await import('/sdk/replay.js')
const replayOptions = { sampleRate: Number(p.get('sampleRate')) }
if (p.get('recording')) replayOptions.recording = p.get('recording')
if (p.get('late')) {
  // Widget-in-replay check: record first, then mount the widget and a shadow root attached before its host joins the DOM.
  sessionReplay({ ...replayOptions, clientId: p.get('client'), apiUrl: p.get('api') }).start()
  while (!window.__useroSessionReplayActive__?.store?.stopRecording) await new Promise(r => setTimeout(r, 50))
  initUseroFeedbackWidget({ clientId: p.get('client'), baseUrl: p.get('api') })
  const host = document.createElement('div')
  const root = host.attachShadow({ mode: 'open' })
  document.body.appendChild(host)
  root.innerHTML = '<p class="late-shadow-probe">custom shadow content</p>'
  window.__lateMounted = true
} else {
  initUseroFeedbackWidget({ clientId: p.get('client'), baseUrl: p.get('api'), plugins: [sessionReplay(replayOptions)] })
}
</script></body></html>`
}

function startStaticServer() {
	const server = createServer(async (req, res) => {
		const url = new URL(req.url ?? '/', 'http://x')
		if (url.pathname === '/page.html') {
			res.writeHead(200, { 'Content-Type': 'text/html' })
			res.end(hostPage())
			return
		}
		if (url.pathname.startsWith('/sdk/')) {
			const file = join(sdkDir, url.pathname.slice('/sdk/'.length))
			if (!file.startsWith(sdkDir)) {
				res.writeHead(403)
				res.end()
				return
			}
			try {
				const body = await readFile(file)
				res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' })
				res.end(body)
			} catch {
				res.writeHead(404)
				res.end()
			}
			return
		}
		res.writeHead(404)
		res.end()
	})
	return listen(server)
}

function listen(server) {
	return new Promise(resolvePort => {
		server.listen(0, '127.0.0.1', () => resolvePort({ server, port: server.address().port }))
	})
}

// ---- in-page instrumentation --------------------------------------------------

function instrument() {
	const perf = { longtasks: [], fetches: [], clickAt: null, successAt: null }
	window.__perf = perf
	new PerformanceObserver(list => {
		for (const e of list.getEntries()) perf.longtasks.push({ start: e.startTime, duration: e.duration })
	}).observe({ type: 'longtask', buffered: true })
	const originalFetch = window.fetch
	window.fetch = function (input, init) {
		const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
		perf.fetches.push({ url, method: init?.method ?? 'GET', at: performance.now() })
		return originalFetch.apply(this, arguments)
	}
	document.addEventListener(
		'click',
		event => {
			const onSubmit = event.composedPath().some(n => n instanceof Element && n.classList.contains('fb-sub'))
			if (onSubmit && perf.clickAt === null) perf.clickAt = performance.now()
		},
		true,
	)
	// Success UI time is the first animation frame after the success message lands in the DOM.
	const watch = () => {
		const root = document.querySelector('[data-usero-widget]')?.shadowRoot
		if (!root) return requestAnimationFrame(watch)
		new MutationObserver(() => {
			if (perf.successAt !== null || perf.successPending || !root.querySelector('.fb-msg--ok')) return
			perf.successPending = true
			requestAnimationFrame(() => {
				perf.successAt = performance.now()
			})
		}).observe(root, { subtree: true, childList: true, characterData: true })
	}
	requestAnimationFrame(watch)
}

// ---- one run -------------------------------------------------------------------

const median = values => {
	const sorted = values.filter(v => typeof v === 'number').sort((a, b) => a - b)
	if (sorted.length === 0) return null
	const mid = Math.floor(sorted.length / 2)
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function overlap(tasks, from, to) {
	let total = 0
	for (const t of tasks) total += Math.max(0, Math.min(t.start + t.duration, to) - Math.max(t.start, from))
	return total
}

// Longest single long task overlapping [from, to], 0 when there is none.
function longest(tasks, from, to) {
	let max = 0
	for (const t of tasks) if (t.start < to && t.start + t.duration > from) max = Math.max(max, t.duration)
	return max
}

async function waitUntil(fn, timeoutMs, label) {
	const started = Date.now()
	for (;;) {
		const value = await fn()
		if (value) return value
		if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${label}`)
		await new Promise(r => setTimeout(r, 50))
	}
}

const liveReplayId = page => page.evaluate(() => window.__useroSessionReplayActive__?.store?.sessionReplayId ?? null)

// Headless tabs never go hidden, so emulate an app switch: report hidden and fire visibilitychange, freeze
// the page for 2 s through CDP (as Android does to a background tab), then come back.
async function switchAppAndBack(cdp, page) {
	const hiddenId = await liveReplayId(page)
	const setVisibility = state =>
		page.evaluate(s => {
			Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s })
			Object.defineProperty(document, 'hidden', { configurable: true, get: () => s === 'hidden' })
			document.dispatchEvent(new Event('visibilitychange'))
		}, state)
	await setVisibility('hidden')
	await cdp.send('Page.setWebLifecycleState', { state: 'frozen' })
	await page.waitForTimeout(2000)
	await cdp.send('Page.setWebLifecycleState', { state: 'active' })
	await setVisibility('visible')
	const shownAt = await page.evaluate(() => performance.now())
	const chunksAtReturn = chunkRequests(hiddenId).length
	// Nothing touches the page for 2 s, so long tasks in that window are the SDK's return work alone.
	await page.waitForTimeout(2000)
	return { sessionId: hiddenId, shownAt, chunksAtReturn }
}

const chunkRequests = id => api.requests.filter(r => r.path.startsWith(`/api/replay-sessions/${id}/chunks/`))

// Same session continued: never finalised, and chunks kept landing after the return.
function sameSessionContinued({ sessionId, chunksAtReturn }) {
	const finalised = api.requests.some(r => r.path === `/api/replay-sessions/${sessionId}/finalise`)
	return !finalised && chunkRequests(sessionId).length > chunksAtReturn
}

const decodeChunk = raw => JSON.parse((raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw).toString('utf8'))

// The SDK no longer forces a full snapshot when the widget mounts: rrweb's attachShadow patch must pick up a
// widget mounted after recording started, its panel, and a shadow root attached before its host joined the DOM.
async function checkWidgetInReplay(browser, pageOrigin, apiOrigin) {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
	const page = await context.newPage()
	try {
		const requestsBefore = api.requests.length
		const query = new URLSearchParams({ client: 'perf-always', api: apiOrigin, sampleRate: '1', late: '1' })
		await page.goto(`${pageOrigin}/page.html?${query}`)
		await page.waitForFunction(() => window.__lateMounted === true, null, { timeout: 20000 })
		await page.locator('.fb-btn').click()
		await page.locator('.fb-ta').fill('widget in replay check')
		// Two chunk intervals so the panel mutations upload.
		await page.waitForTimeout(7000)
		const id = await page.evaluate(() => window.__useroSessionReplayActive__?.store?.sessionReplayId ?? null)
		const events = api.requests
			.slice(requestsBefore)
			.filter(r => r.raw && r.path.startsWith(`/api/replay-sessions/${id}/chunks/`))
			.sort((a, b) => Number(a.path.split('/').pop()) - Number(b.path.split('/').pop()))
			.flatMap(r => decodeChunk(r.raw))
		const shadowAdds = JSON.stringify(
			events.filter(e => e.type === 3 && e.data.source === 0).flatMap(e => e.data.adds.filter(a => a.node.isShadow)),
		)
		const result = {
			fullSnapshots: events.filter(e => e.type === 2).length,
			launcher: shadowAdds.includes('fb-btn'),
			panel: shadowAdds.includes('fb-ta'),
			preAttachedRoot: shadowAdds.includes('late-shadow-probe'),
		}
		const failures = []
		if (result.fullSnapshots !== 1) failures.push(`expected 1 full snapshot, got ${result.fullSnapshots}`)
		if (!result.launcher) failures.push('launcher (.fb-btn) missing from incremental shadow adds')
		if (!result.panel) failures.push('panel (.fb-ta) missing from incremental shadow adds')
		if (!result.preAttachedRoot) failures.push('shadow root attached before its host joined the DOM is missing')
		return { ...result, failures }
	} finally {
		await context.close()
	}
}

async function runOnce(browser, pageOrigin, apiOrigin, name, scenario) {
	const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
	const page = await context.newPage()
	try {
		await page.addInitScript(instrument)
		const cdp = await context.newCDPSession(page)
		await cdp.send('Network.enable')
		await cdp.send('Network.emulateNetworkConditions', NETWORK)
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN })

		const client = args.client ?? `perf-${scenario.mode}`
		const query = new URLSearchParams({ client, api: apiOrigin, sampleRate: String(scenario.sampleRate) })
		// A real server's recording setting is per project, so pin the mode client-side there.
		if (args.api) query.set('recording', scenario.mode)
		const requestsBefore = api.requests.length
		await page.goto(`${pageOrigin}/page.html?${query}`)
		await page.locator('.fb-btn').waitFor()
		if (scenario.waitForRecording) {
			await waitUntil(
				() => page.evaluate(() => Boolean(window.__useroSessionReplayActive__?.store?.sessionReplayId)),
				15000,
				'live recording',
			)
		}
		const appSwitch = scenario.appSwitch ? await switchAppAndBack(cdp, page) : null

		await page.locator('.fb-btn').click()
		await page.locator('.fb-ec').first().click()
		await page.locator('.fb-ta').fill('The checkout button does nothing on my phone')
		// Typing time: lets the panel-open rrweb preload and any init work settle like a real user would.
		await page.waitForTimeout(1500)

		await page.locator('.fb-sub').click()
		const consent = page.locator('[data-usero-session-context-consent] button.include')
		const deadline = Date.now() + 20000
		let consentClicked = false
		for (;;) {
			const done = await page.evaluate(() => window.__perf.successAt !== null)
			if (!consentClicked && name === 'ask' && (await consent.count()) > 0) {
				await consent.click()
				consentClicked = true
			}
			if (done && (name !== 'ask' || consentClicked)) break
			if (Date.now() > deadline) throw new Error('timed out waiting for success UI')
			await page.waitForTimeout(50)
		}

		// Background snapshot work, then the link.
		let linked = null
		let widgetInSnapshot = null
		if (!args.api) {
			const post = await waitUntil(
				() => api.requests.slice(requestsBefore).find(r => r.path === '/api/feedback' && r.method === 'POST'),
				5000,
				'feedback POST at the mock',
			)
			if (appSwitch) {
				// Linked only when the POST carries the session that was live before the switch, it was never
				// finalised and it kept uploading chunks after the return.
				const ok =
					post.body.sessionReplayId === appSwitch.sessionId &&
					(await waitUntil(() => sameSessionContinued(appSwitch), 10000, 'chunks after return').catch(() => false))
				linked = ok ? 'in POST, same session' : null
			} else if (post.body.sessionReplayId) {
				linked = 'in POST'
			} else {
				const create = await waitUntil(
					() =>
						api.requests
							.slice(requestsBefore)
							.find(
								r =>
									r.path === '/api/replay-sessions' &&
									r.body?.snapshotOnly &&
									r.body.feedbackId === post.feedbackId &&
									r.body.linkToken === `token-${post.feedbackId}`,
							),
					20000,
					'snapshot create linked to the feedback',
				).catch(() => null)
				linked = create ? 'at snapshot create' : null
				if (create) {
					const chunk = await waitUntil(
						() => api.requests.find(r => r.path === `/api/replay-sessions/${create.sessionReplayId}/chunks/0` && r.raw),
						15000,
						'snapshot chunk',
					).catch(() => null)
					widgetInSnapshot = chunk ? snapshotHasWidget(chunk.raw) : null
				}
			}
		}
		await page.waitForTimeout(1000)

		const perf = await page.evaluate(() => ({
			...window.__perf,
			load: performance.getEntriesByName('usero:snapshot-load')[0]?.duration ?? null,
			serialise: performance.getEntriesByName('usero:snapshot-serialise')[0]?.duration ?? null,
			recordStart: performance.getEntriesByName('usero:record-start')[0]?.toJSON() ?? null,
		}))
		const recordStart = perf.recordStart
		const post = perf.fetches.find(f => f.method === 'POST' && /\/api\/feedback$/.test(f.url))
		const beforePost = perf.fetches.filter(f => f.at >= perf.clickAt && f.at < (post?.at ?? Infinity))
		const preflighted = api.requests.slice(requestsBefore).some(r => r.method === 'OPTIONS' && r.path === '/api/feedback')
		return {
			clickToPostMs: post ? post.at - perf.clickAt : null,
			clickToSuccessMs: perf.successAt - perf.clickAt,
			longTaskToSuccessMs: overlap(perf.longtasks, perf.clickAt, perf.successAt),
			longTask5sMs: overlap(perf.longtasks, perf.clickAt, perf.clickAt + 5000),
			snapshotLoadMs: perf.load,
			snapshotSerialiseMs: perf.serialise,
			requestsBeforePost: beforePost.map(f => `${f.method} ${new URL(f.url).pathname}`),
			preflighted,
			linked,
			widgetInSnapshot,
			recordStartMs: recordStart ? recordStart.duration : null,
			recordLongTaskMs: recordStart
				? longest(perf.longtasks, recordStart.startTime, recordStart.startTime + recordStart.duration)
				: null,
			returnLongTaskMs: appSwitch ? longest(perf.longtasks, appSwitch.shownAt, appSwitch.shownAt + 2000) : null,
		}
	} finally {
		await context.close()
	}
}

// ---- main -------------------------------------------------------------------------

const round = v => (v === null ? '-' : String(Math.round(v)))

async function main() {
	const statics = await startStaticServer()
	const mock = args.api ? null : await startMockApi()
	const pageOrigin = `http://127.0.0.1:${statics.port}`
	// localhost vs 127.0.0.1 keeps the API cross-origin, like a customer site calling usero.io.
	const apiOrigin = args.api ?? `http://localhost:${mock.port}`
	const browser = await chromium.launch({ headless: true })
	const names = args.scenario ? [args.scenario].filter(n => n in SCENARIOS) : Object.keys(SCENARIOS)
	const results = {}
	let widgetCheck = null
	try {
		if (!args.api && (!args.scenario || args.scenario === 'widget')) {
			widgetCheck = await checkWidgetInReplay(browser, pageOrigin, apiOrigin)
			const { fullSnapshots, launcher, panel, preAttachedRoot } = widgetCheck
			const found = JSON.stringify({ fullSnapshots, launcher, panel, preAttachedRoot })
			console.log(`widget in replay (mounted after record start): ${found}`)
		}
		for (const name of names) {
			results[name] = []
			for (let i = 0; i < runs; i++) {
				const run = await runOnce(browser, pageOrigin, apiOrigin, name, SCENARIOS[name])
				results[name].push(run)
				process.stdout.write(
					`${name} #${i + 1}: post ${round(run.clickToPostMs)} ms, success ${round(run.clickToSuccessMs)} ms, ` +
						`long tasks ${round(run.longTaskToSuccessMs)} ms${run.linked ? `, linked ${run.linked}` : ''}\n`,
				)
			}
		}
	} finally {
		await browser.close()
		statics.server.close()
		mock?.server.close()
	}

	const metrics = [
		'clickToPostMs',
		'clickToSuccessMs',
		'longTaskToSuccessMs',
		'longTask5sMs',
		'snapshotLoadMs',
		'snapshotSerialiseMs',
		'recordStartMs',
		'recordLongTaskMs',
		'returnLongTaskMs',
	]
	const medians = {}
	console.log(`\nMedians over ${runs} runs (latency ${NETWORK.latency} ms, CPU ${CPU_SLOWDOWN}x), SDK ${sdkDir}`)
	console.log(['scenario'.padEnd(10), ...metrics.map(m => m.replace(/Ms$/, '').padStart(20)), '  linked'].join(''))
	for (const name of names) {
		medians[name] = Object.fromEntries(metrics.map(m => [m, median(results[name].map(r => r[m]))]))
		const linkedRuns = results[name].filter(r => r.linked).length
		console.log(
			[name.padEnd(10), ...metrics.map(m => round(medians[name][m]).padStart(20)), `  ${linkedRuns}/${runs}`].join(''),
		)
		const awaited = results[name].flatMap(r => r.requestsBeforePost)
		if (awaited.length > 0) console.log(`  requests before the POST: ${[...new Set(awaited)].join(', ')}`)
		const preflights = results[name].filter(r => r.preflighted).length
		if (preflights > 0) console.log(`  CORS preflight before the POST on ${preflights}/${runs} runs`)
	}
	if (args.json) await writeFile(args.json, JSON.stringify({ network: NETWORK, cpu: CPU_SLOWDOWN, results, medians }, null, 2))

	if (args['no-budget']) return
	// A missing widget is a correctness failure, not a timing one, but it fails the run all the same.
	const failures = widgetCheck ? widgetCheck.failures.map(f => `widget in replay: ${f}`) : []
	for (const name of names) {
		// Return work is held to zero on every run, not just the median.
		const worstReturn = Math.max(0, ...results[name].map(r => r.returnLongTaskMs ?? 0))
		if (worstReturn > BUDGETS.returnLongTaskMs) failures.push(`${name} returnLongTaskMs ${Math.round(worstReturn)} on one run`)
		for (const [metric, budget] of Object.entries(BUDGETS)) {
			const value = medians[name][metric]
			if (value !== null && value > budget) failures.push(`${name} ${metric} ${Math.round(value)} > ${budget}`)
		}
		if (!args.api && results[name].some(r => !r.linked)) failures.push(`${name}: replay link missing on some runs`)
		if (results[name].some(r => r.widgetInSnapshot === true)) {
			failures.push(`${name}: the widget was captured in the page snapshot`)
		}
	}
	if (failures.length > 0) {
		console.error(`\nperf: OVER BUDGET\n  ${failures.join('\n  ')}\nSee docs/PERFORMANCE.md before raising a budget.`)
		process.exit(1)
	}
	console.log('\nperf: OK, every scenario is within budget.')
}

main().catch(err => {
	console.error('perf: crashed:', err)
	process.exit(1)
})
