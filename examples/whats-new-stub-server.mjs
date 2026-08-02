// Tiny stub of the Usero backend's GET /api/changelog endpoint, for
// developing examples/whats-new.html before the real endpoint ships.
//
//   node examples/whats-new-stub-server.mjs   # listens on :5273
//
// Port 5273 (not 5271) so it never collides with a real local Usero dev
// server; open the example with ?baseUrl=http://localhost:5273 to use it.
//
// Matches the fixed backend contract:
//   { entries: [...], yours: [...], boardUrl }
// `yours` is only returned when an email query param is present, mirroring
// the real endpoint's identified-user behaviour.

import { createServer } from 'node:http'

const PORT = 5273

const ENTRIES = [
	{
		slug: 'slack-threads',
		title: 'Slack replies sync as comment threads',
		excerpt: 'Replies in your Slack channel now land on the feedback item as a thread.',
		type: 'improvement',
		publishedAt: '2026-08-01T09:00:00.000Z',
		url: 'https://usero.io/changelog/slack-threads',
	},
	{
		slug: 'dark-mode',
		title: 'Widget follows your OS theme',
		excerpt: 'The widget auto-switches between light and dark based on prefers-color-scheme.',
		type: 'feature',
		publishedAt: '2026-07-24T09:00:00.000Z',
		url: 'https://usero.io/changelog/dark-mode',
	},
	{
		slug: 'replay-scrubber',
		title: 'Session replay scrubber fix',
		excerpt: null,
		type: 'fix',
		publishedAt: '2026-07-10T09:00:00.000Z',
		url: null,
	},
]

const YOURS = [
	{
		entrySlug: 'dark-mode',
		quote: 'The widget is blinding at night, any chance of a dark mode?',
		prTitle: 'feat(widget): auto dark mode via prefers-color-scheme',
	},
]

const server = createServer((req, res) => {
	const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
	// CORS: the example page is opened from file:// or another port.
	res.setHeader('Access-Control-Allow-Origin', '*')
	res.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type')
	if (req.method === 'OPTIONS') {
		res.writeHead(204)
		res.end()
		return
	}
	if (url.pathname === '/api/changelog') {
		const email = url.searchParams.get('email')
		const limit = Number(url.searchParams.get('limit') ?? '') || ENTRIES.length
		const body = {
			entries: ENTRIES.slice(0, limit),
			yours: email ? YOURS : [],
			boardUrl: 'https://usero.io/board/demo',
		}
		res.writeHead(200, { 'Content-Type': 'application/json' })
		res.end(JSON.stringify(body))
		return
	}
	if (url.pathname === '/api/ping') {
		res.writeHead(200, { 'Content-Type': 'application/json' })
		res.end('{"ok":true}')
		return
	}
	res.writeHead(404, { 'Content-Type': 'application/json' })
	res.end('{"error":"not found"}')
})

server.listen(PORT, () => {
	console.log(`whats-new stub listening on http://localhost:${PORT}`)
	console.log(`try: curl 'http://localhost:${PORT}/api/changelog?clientId=demo&email=a@b.c'`)
})
