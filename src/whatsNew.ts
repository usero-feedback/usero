// "What's new" feed support for the widget. Opt-in via the `whatsNew`
// flag on FeedbackWidgetProps. Framework-free and UI-free: this module
// owns the feed fetch + defensive parse and the unread/last-seen logic;
// vanilla.ts owns the rendering.
//
// Failure policy: the widget must never break the host page. Every
// network or parse failure resolves to `null` (feature silently off for
// the page view). Every storage access is try/catch wrapped.

// ---- Wire types (backend contract, treat as fixed) ----------------------

export interface WhatsNewEntry {
	slug: string
	title: string
	excerpt: string | null
	type: string
	publishedAt: string
	url: string | null
}

export interface WhatsNewYours {
	entrySlug: string
	quote: string | null
	prTitle: string
}

export interface WhatsNewFeed {
	entries: WhatsNewEntry[]
	yours: WhatsNewYours[]
	boardUrl: string | null
}

// ---- Defensive parsing --------------------------------------------------

function asOptionalString(value: unknown): string | null {
	return typeof value === 'string' ? value : null
}

function parseEntry(value: unknown): WhatsNewEntry | null {
	if (typeof value !== 'object' || value === null) return null
	const obj = value as Record<string, unknown>
	if (
		typeof obj.slug !== 'string' ||
		typeof obj.title !== 'string' ||
		typeof obj.type !== 'string' ||
		typeof obj.publishedAt !== 'string'
	) {
		return null
	}
	return {
		slug: obj.slug,
		title: obj.title,
		excerpt: asOptionalString(obj.excerpt),
		type: obj.type,
		publishedAt: obj.publishedAt,
		url: asOptionalString(obj.url),
	}
}

function parseYours(value: unknown): WhatsNewYours | null {
	if (typeof value !== 'object' || value === null) return null
	const obj = value as Record<string, unknown>
	if (typeof obj.entrySlug !== 'string' || typeof obj.prTitle !== 'string') {
		return null
	}
	return {
		entrySlug: obj.entrySlug,
		quote: asOptionalString(obj.quote),
		prTitle: obj.prTitle,
	}
}

// Parse an unknown response body into a WhatsNewFeed, dropping any
// malformed rows rather than rejecting the whole payload. Returns null
// only when the top-level shape is unusable.
export function parseWhatsNewFeed(value: unknown): WhatsNewFeed | null {
	if (typeof value !== 'object' || value === null) return null
	const obj = value as Record<string, unknown>
	if (!Array.isArray(obj.entries)) return null
	const entries: WhatsNewEntry[] = []
	for (const raw of obj.entries) {
		const entry = parseEntry(raw)
		if (entry) entries.push(entry)
	}
	const yours: WhatsNewYours[] = []
	if (Array.isArray(obj.yours)) {
		for (const raw of obj.yours) {
			const item = parseYours(raw)
			if (item) yours.push(item)
		}
	}
	return {
		entries,
		yours,
		boardUrl: asOptionalString(obj.boardUrl),
	}
}

// ---- Fetch --------------------------------------------------------------

export interface FetchWhatsNewOptions {
	baseUrl: string
	clientId: string
	email?: string
	limit?: number
}

// Fetch the published changelog feed. Resolves null on ANY failure
// (network error, timeout, non-2xx, malformed body). Never throws.
export async function fetchWhatsNewFeed(
	options: FetchWhatsNewOptions,
): Promise<WhatsNewFeed | null> {
	if (typeof fetch !== 'function') return null
	try {
		const base = options.baseUrl.replace(/\/$/, '')
		const params = new URLSearchParams({ clientId: options.clientId })
		if (options.email) params.set('email', options.email)
		if (options.limit !== undefined) params.set('limit', String(options.limit))
		const response = await fetch(`${base}/api/changelog?${params.toString()}`, {
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(10000),
		})
		if (!response.ok) return null
		const body: unknown = await response.json()
		return parseWhatsNewFeed(body)
	} catch {
		return null
	}
}

// ---- Unread / last-seen logic -------------------------------------------
//
// Per-client localStorage key stores the newest `publishedAt` the user has
// seen (set when the What's new view is opened). Unread = entries strictly
// newer than that.
//
// Storage-unavailable policy: treat everything as READ (no dot). If we
// cannot persist last-seen, a dot shown now would come back on every page
// load forever, which trains users to ignore it. Skipping the dot degrades
// to "no badge" rather than "permanent nag"; the tab and the list itself
// still work.

const LAST_SEEN_KEY_PREFIX = 'usero:whats-new:last-seen:'

function lastSeenKey(clientId: string): string {
	return `${LAST_SEEN_KEY_PREFIX}${clientId}`
}

function storageAvailable(): boolean {
	if (typeof window === 'undefined') return false
	try {
		const probe = 'usero:whats-new:probe'
		window.localStorage.setItem(probe, '1')
		window.localStorage.removeItem(probe)
		return true
	} catch {
		return false
	}
}

export function readLastSeen(clientId: string): string | null {
	if (typeof window === 'undefined') return null
	try {
		return window.localStorage.getItem(lastSeenKey(clientId))
	} catch {
		return null
	}
}

function writeLastSeen(clientId: string, iso: string): void {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(lastSeenKey(clientId), iso)
	} catch {
		// Sandboxed iframe / Safari Lockdown / quota. Nothing to do; the
		// unread count already reports 0 when storage is unavailable.
	}
}

function parseTime(iso: string): number | null {
	const t = Date.parse(iso)
	return Number.isNaN(t) ? null : t
}

// Pure: count entries strictly newer than lastSeenIso. `lastSeenIso null`
// means "never opened the view", so every parseable entry is unread.
// Entries with unparseable publishedAt count as read (never nag on
// garbage data).
export function countUnread(
	entries: ReadonlyArray<WhatsNewEntry>,
	lastSeenIso: string | null,
): number {
	const lastSeenMs = lastSeenIso === null ? null : parseTime(lastSeenIso)
	let count = 0
	for (const entry of entries) {
		const t = parseTime(entry.publishedAt)
		if (t === null) continue
		if (lastSeenMs === null || t > lastSeenMs) count += 1
	}
	return count
}

// Pure: the newest parseable publishedAt among entries, or null.
export function newestPublishedAt(
	entries: ReadonlyArray<WhatsNewEntry>,
): string | null {
	let bestMs: number | null = null
	let bestIso: string | null = null
	for (const entry of entries) {
		const t = parseTime(entry.publishedAt)
		if (t === null) continue
		if (bestMs === null || t > bestMs) {
			bestMs = t
			bestIso = entry.publishedAt
		}
	}
	return bestIso
}

// Effective unread count for the launcher dot, honouring the
// storage-unavailable policy above.
export function getUnreadCount(
	clientId: string,
	entries: ReadonlyArray<WhatsNewEntry>,
): number {
	if (!storageAvailable()) return 0
	return countUnread(entries, readLastSeen(clientId))
}

// Persist "the user has now seen everything currently in the feed".
export function markAllSeen(
	clientId: string,
	entries: ReadonlyArray<WhatsNewEntry>,
): void {
	const newest = newestPublishedAt(entries)
	if (newest === null) return
	writeLastSeen(clientId, newest)
}

// Test-only surface, re-exported from the vanilla entry as
// __whatsNewTest__ (same pattern as __identityTest__).
export const __test__ = {
	parseWhatsNewFeed,
	countUnread,
	newestPublishedAt,
}
