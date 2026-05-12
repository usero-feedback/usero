// Identity layer for the Usero SDK.
//
// Two responsibilities:
//   1. Mint and persist a stable per-browser `anonymousId` in localStorage
//      so cross-tab + cross-day replays from the same browser stitch
//      together server-side. Falls back to an in-memory id if storage is
//      blocked (sandboxed iframes, Safari Lockdown, full quota). Replay
//      still works in that case, you just lose stitching.
//   2. Auto-fire POST /api/identify when the resolved user transitions
//      (null -> id, id -> id'). Deduped by an in-memory fingerprint so
//      re-renders with the same user are no-ops on the network.
//
// All storage access is wrapped in try/catch and gated behind a one-shot
// init read. The hot path (replay chunk flush) never touches localStorage.

const ANON_STORAGE_KEY = 'usero:anonymous-id'

let cachedAnonymousId: string | null = null
// Fingerprint of the last identify we POSTed. Same SDK instance + same
// resolved user + same traits = no-op. Cleared on logout (anonymousId
// rotation).
let lastIdentifyFingerprint: string | null = null

export type UserTraitValue = string | number | boolean | null
export type UserTraits = Record<string, UserTraitValue>

export interface UseroUser {
	id: string
	email?: string
	displayName?: string
	traits?: UserTraits
}

function generateRandomId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID()
	}
	const bytes = new Uint8Array(16)
	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		crypto.getRandomValues(bytes)
	} else {
		for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
	}
	let out = ''
	for (const b of bytes) out += b.toString(16).padStart(2, '0')
	return out
}

function safeReadLocalStorage(key: string): string | null {
	if (typeof window === 'undefined') return null
	try {
		return window.localStorage?.getItem(key) ?? null
	} catch {
		return null
	}
}

function safeWriteLocalStorage(key: string, value: string): void {
	if (typeof window === 'undefined') return
	try {
		window.localStorage?.setItem(key, value)
	} catch {
		// Sandboxed iframe / Safari Lockdown / quota. Fall back to memory.
	}
}

/**
 * Returns the stable per-browser anonymousId. Reads localStorage at most
 * once per SDK instance. Subsequent calls hit the in-memory cache, so
 * even hot paths (per-event in replay) are safe to call this.
 */
export function getOrMintAnonymousId(): string {
	if (cachedAnonymousId) return cachedAnonymousId
	const existing = safeReadLocalStorage(ANON_STORAGE_KEY)
	// Sanity filter, not strict validation. We accept anything that looks
	// plausibly like an id (>=8 alphanumeric-or-hyphen) so older SDK
	// versions that wrote a slightly different shape still stitch. Fresh
	// mint is cheap, so we only reject obvious garbage; tightening this
	// would force rotation in customer browsers and split otherwise-good
	// sibling-session attribution.
	if (existing && /^[a-z0-9-]{8,}$/i.test(existing)) {
		cachedAnonymousId = existing
		return existing
	}
	const id = generateRandomId()
	safeWriteLocalStorage(ANON_STORAGE_KEY, id)
	cachedAnonymousId = id
	return id
}

/**
 * Rotate the anonymousId. Called on logout (user transitions from a
 * known id to null) so the next anonymous trail does not get auto-merged
 * into the previous person on the next identify().
 */
export function rotateAnonymousId(): string {
	const id = generateRandomId()
	cachedAnonymousId = id
	safeWriteLocalStorage(ANON_STORAGE_KEY, id)
	lastIdentifyFingerprint = null
	return id
}

function fingerprintUser(anonymousId: string, user: UseroUser): string {
	// Stable across re-renders: keys sorted, traits canonicalised. Cheap
	// enough on the hot path (only runs when the SDK thinks the user might
	// have changed, never per-event).
	const traits = user.traits ?? {}
	const keys = Object.keys(traits).sort()
	const canonical: Array<[string, UserTraitValue]> = keys.map(k => [k, traits[k] ?? null])
	return JSON.stringify([anonymousId, user.id, user.email ?? null, user.displayName ?? null, canonical])
}

export interface IdentifyTransport {
	apiUrl: string
	clientId: string
}

/**
 * POST to /api/identify if the (anonymousId, user) fingerprint differs
 * from the last call. Returns true if a network request actually fired.
 * Never throws; failures are best-effort and the caller (the widget /
 * provider) should not treat them as errors.
 *
 * Tab-unload safety: if the page is hidden when this fires (visibility
 * 'hidden' or a pagehide handler), we route the payload through
 * `navigator.sendBeacon` so the request survives unload. Otherwise we
 * use a normal fetch and only cache the fingerprint when the server
 * confirms `accepted: true`. A 200 `{ accepted: false }` (e.g.
 * `unknown_client` for a clientId that becomes valid mid-session) is
 * treated as retryable so the next call re-fires.
 */
export async function identifyIfChanged(transport: IdentifyTransport, user: UseroUser): Promise<boolean> {
	const anonymousId = getOrMintAnonymousId()
	const fp = fingerprintUser(anonymousId, user)
	if (fp === lastIdentifyFingerprint) return false

	const url = `${transport.apiUrl.replace(/\/$/, '')}/api/identify`
	// Body must stay under the browser's keepalive / sendBeacon cap
	// (~64KB across most engines) when this fires on pagehide. That
	// transitively caps trait payload size; in practice traits should be
	// small typed scalars, not blobs.
	const body = JSON.stringify({
		clientId: transport.clientId,
		anonymousId,
		externalUserId: user.id,
		email: user.email,
		displayName: user.displayName,
		traits: user.traits,
	})

	// If the document is hidden (pagehide / tab close in flight), best-effort
	// hand off to sendBeacon. We don't get a response back, so we optimistically
	// cache the fingerprint to avoid re-firing on the next page; the server is
	// idempotent if the page reload re-runs identify with the same payload.
	if (
		typeof document !== 'undefined' &&
		document.visibilityState === 'hidden' &&
		typeof navigator !== 'undefined' &&
		typeof navigator.sendBeacon === 'function'
	) {
		try {
			const blob = new Blob([body], { type: 'application/json' })
			// sendBeacon returns false when the user agent refuses to queue
			// the request (size cap, or historically Safari rejecting
			// non-CORS-simple content types). Modern Safari accepts
			// application/json, but we keep a keepalive-fetch fallback so an
			// older WebKit that rejects the beacon still ships the identify.
			if (navigator.sendBeacon(url, blob)) {
				lastIdentifyFingerprint = fp
				return true
			}
		} catch {
			// fall through to keepalive fetch below
		}
	}

	try {
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body,
			// keepalive lets the request survive a tab-close mid-flight on
			// browsers that support it; sendBeacon above is the primary path.
			keepalive: true,
		})
		if (!res.ok) return true
		// Parse the response: a 200 with `accepted: false` (e.g. unknown
		// client) is retryable. Only cache the fingerprint when the server
		// confirmed it actually stored the identity.
		try {
			const json = (await res.json()) as { accepted?: unknown }
			if (json && json.accepted === true) lastIdentifyFingerprint = fp
		} catch {
			// Server returned 2xx but unparseable body: don't cache, let the
			// next call retry.
		}
		return true
	} catch {
		return false
	}
}

/**
 * Clear identify state and rotate anonymousId. Called when the resolved
 * user transitions from a known id to null (logout). The next anonymous
 * trail will get a fresh anonymousId so it does not merge into the
 * previous person.
 */
export function handleLogout(): void {
	rotateAnonymousId()
}

// Test hooks (not exported from the package public surface).
export const __test__ = {
	ANON_STORAGE_KEY,
	resetIdentityState: (): void => {
		cachedAnonymousId = null
		lastIdentifyFingerprint = null
	},
}
