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

function safeRemoveLocalStorage(key: string): void {
	if (typeof window === 'undefined') return
	try {
		window.localStorage?.removeItem(key)
	} catch {
		// ignore
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
	safeRemoveLocalStorage(ANON_STORAGE_KEY)
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
 */
export async function identifyIfChanged(
	transport: IdentifyTransport,
	user: UseroUser,
): Promise<boolean> {
	const anonymousId = getOrMintAnonymousId()
	const fp = fingerprintUser(anonymousId, user)
	if (fp === lastIdentifyFingerprint) return false

	try {
		const res = await fetch(`${transport.apiUrl.replace(/\/$/, '')}/api/identify`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				clientId: transport.clientId,
				anonymousId,
				externalUserId: user.id,
				email: user.email,
				displayName: user.displayName,
				traits: user.traits,
			}),
		})
		// Cache fingerprint on 2xx so we don't hammer the endpoint. On error
		// we leave the fingerprint untouched so the next call will retry.
		if (res.ok) lastIdentifyFingerprint = fp
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
