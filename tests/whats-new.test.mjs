// What's-new feed: parse + unread/last-seen logic.
//
// Run with: node --test tests/whats-new.test.mjs
//
// Exercises the pure helpers exported (test-only) from the vanilla entry
// as __whatsNewTest__. No DOM required: countUnread / newestPublishedAt /
// parseWhatsNewFeed are storage-free by design; the storage-aware wrappers
// (getUnreadCount / markAllSeen) are covered by the manual example flow.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { __whatsNewTest__ } from '../dist/vanilla.js'

const { parseWhatsNewFeed, countUnread, newestPublishedAt } = __whatsNewTest__

function entry(overrides = {}) {
	return {
		slug: 'dark-mode',
		title: 'Dark mode',
		excerpt: 'The widget now follows your OS theme.',
		type: 'feature',
		publishedAt: '2026-07-01T00:00:00.000Z',
		url: 'https://usero.io/changelog/dark-mode',
		...overrides,
	}
}

test('parseWhatsNewFeed accepts a well-formed payload', () => {
	const feed = parseWhatsNewFeed({
		entries: [entry()],
		yours: [{ entrySlug: 'dark-mode', quote: 'please add dark mode', prTitle: 'feat: dark mode' }],
		boardUrl: 'https://usero.io/board',
	})
	assert.ok(feed)
	assert.equal(feed.entries.length, 1)
	assert.equal(feed.entries[0].slug, 'dark-mode')
	assert.equal(feed.yours.length, 1)
	assert.equal(feed.yours[0].prTitle, 'feat: dark mode')
	assert.equal(feed.boardUrl, 'https://usero.io/board')
})

test('parseWhatsNewFeed drops malformed rows instead of rejecting the feed', () => {
	const feed = parseWhatsNewFeed({
		entries: [
			entry(),
			{ slug: 42, title: 'bad' }, // slug not a string
			null,
			'nope',
		],
		yours: [{ entrySlug: 'x' }, { entrySlug: 'ok', prTitle: 'fix: y', quote: null }],
		boardUrl: 12,
	})
	assert.ok(feed)
	assert.equal(feed.entries.length, 1)
	assert.equal(feed.yours.length, 1)
	assert.equal(feed.yours[0].entrySlug, 'ok')
	assert.equal(feed.boardUrl, null)
})

test('parseWhatsNewFeed normalises missing optionals to null', () => {
	const feed = parseWhatsNewFeed({
		entries: [entry({ excerpt: undefined, url: undefined })],
	})
	assert.ok(feed)
	assert.equal(feed.entries[0].excerpt, null)
	assert.equal(feed.entries[0].url, null)
	assert.deepEqual(feed.yours, [])
	assert.equal(feed.boardUrl, null)
})

test('parseWhatsNewFeed rejects unusable top-level shapes', () => {
	assert.equal(parseWhatsNewFeed(null), null)
	assert.equal(parseWhatsNewFeed('x'), null)
	assert.equal(parseWhatsNewFeed({}), null)
	assert.equal(parseWhatsNewFeed({ entries: 'not-an-array' }), null)
})

test('countUnread: everything unread when never seen', () => {
	const entries = [
		entry({ publishedAt: '2026-07-01T00:00:00.000Z' }),
		entry({ slug: 'b', publishedAt: '2026-07-02T00:00:00.000Z' }),
	]
	assert.equal(countUnread(entries, null), 2)
})

test('countUnread: only entries strictly newer than last-seen count', () => {
	const entries = [
		entry({ slug: 'a', publishedAt: '2026-07-01T00:00:00.000Z' }),
		entry({ slug: 'b', publishedAt: '2026-07-02T00:00:00.000Z' }),
		entry({ slug: 'c', publishedAt: '2026-07-03T00:00:00.000Z' }),
	]
	assert.equal(countUnread(entries, '2026-07-02T00:00:00.000Z'), 1)
	assert.equal(countUnread(entries, '2026-07-03T00:00:00.000Z'), 0)
	assert.equal(countUnread(entries, '2026-06-01T00:00:00.000Z'), 3)
})

test('countUnread: unparseable dates never count as unread', () => {
	const entries = [
		entry({ slug: 'good', publishedAt: '2026-07-02T00:00:00.000Z' }),
		entry({ slug: 'bad', publishedAt: 'not-a-date' }),
	]
	assert.equal(countUnread(entries, null), 1)
	assert.equal(countUnread(entries, '2026-07-01T00:00:00.000Z'), 1)
})

test('countUnread: unparseable last-seen treats parseable entries as unread', () => {
	// A corrupt stored value must not permanently silence the dot.
	const entries = [entry({ publishedAt: '2026-07-02T00:00:00.000Z' })]
	assert.equal(countUnread(entries, 'garbage'), 1)
})

test('newestPublishedAt picks the max by parsed time, ignoring garbage', () => {
	const entries = [
		entry({ slug: 'a', publishedAt: '2026-07-01T00:00:00.000Z' }),
		entry({ slug: 'c', publishedAt: '2026-07-03T00:00:00.000Z' }),
		entry({ slug: 'b', publishedAt: '2026-07-02T00:00:00.000Z' }),
		entry({ slug: 'x', publishedAt: 'garbage' }),
	]
	assert.equal(newestPublishedAt(entries), '2026-07-03T00:00:00.000Z')
	assert.equal(newestPublishedAt([]), null)
	assert.equal(newestPublishedAt([entry({ publishedAt: 'garbage' })]), null)
})

test('mark-then-count round trip clears unread', () => {
	const entries = [
		entry({ slug: 'a', publishedAt: '2026-07-01T00:00:00.000Z' }),
		entry({ slug: 'b', publishedAt: '2026-07-05T12:30:00.000Z' }),
	]
	const seen = newestPublishedAt(entries)
	assert.equal(countUnread(entries, seen), 0)
	// A newer entry arriving later becomes unread again.
	const withNew = [...entries, entry({ slug: 'c', publishedAt: '2026-07-06T00:00:00.000Z' })]
	assert.equal(countUnread(withNew, seen), 1)
})
