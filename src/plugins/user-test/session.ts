// Session lifecycle + persistence for the user-test plugin: the localStorage
// resume state (read/write/clear/persist), URL param parsing (slug + adopt id),
// tester-name lookup, and every SaaS network call (create / adopt / finalise /
// payout / notes). No DOM here. Pure data + fetch.

import { isValidSdkSessionId } from '../../identity'
import {
	ACTIVE_SESSION_MAX_AGE_MS,
	ACTIVE_SESSION_STORAGE_KEY,
	type ActiveSessionState,
	type AdoptResult,
	type FinaliseNote,
	type FinaliseResult,
	type Logger,
	type MutedSegment,
	type PaymentSummary,
	type PostNoteResult,
	RESUME_MAX_IDLE_MS,
	type RecorderStore,
	TESTER_NAME_STORAGE_KEY,
	type UserTestTask,
} from './shared'

export function parseActiveSession(raw: unknown): ActiveSessionState | null {
	if (typeof raw !== 'object' || raw === null) return null
	const s = raw as {
		slug?: unknown
		sessionId?: unknown
		nextChunkIndex?: unknown
		startedAt?: unknown
		status?: unknown
		sdkSessionId?: unknown
		pausedAt?: unknown
	}
	if (typeof s.slug !== 'string' || !s.slug) return null
	if (typeof s.sessionId !== 'string' || !s.sessionId) return null
	if (typeof s.nextChunkIndex !== 'number' || !Number.isInteger(s.nextChunkIndex) || s.nextChunkIndex < 0) return null
	if (typeof s.startedAt !== 'number' || !Number.isFinite(s.startedAt)) return null
	const status = s.status === 'paused' ? 'paused' : 'active'
	const result: ActiveSessionState = {
		slug: s.slug,
		sessionId: s.sessionId,
		nextChunkIndex: s.nextChunkIndex,
		startedAt: s.startedAt,
		status,
	}
	// Loose sanity filter, same shape the core uses for the id. A bad value is
	// dropped (resume still works for audio, only the replay link is at risk).
	if (typeof s.sdkSessionId === 'string' && isValidSdkSessionId(s.sdkSessionId)) {
		result.sdkSessionId = s.sdkSessionId
	}
	if (typeof s.pausedAt === 'number' && Number.isFinite(s.pausedAt)) {
		result.pausedAt = s.pausedAt
	}
	return result
}

// Read the persisted active session for this origin, or null when absent,
// unparseable, or stale (> ACTIVE_SESSION_MAX_AGE_MS). Storage access is wrapped
// because localStorage can throw in sandboxed iframes / lockdown modes; a throw
// must never break the plugin (we just don't resume).
export function readActiveSession(): ActiveSessionState | null {
	try {
		const raw = window.localStorage?.getItem(ACTIVE_SESSION_STORAGE_KEY)
		if (!raw) return null
		const parsed = parseActiveSession(JSON.parse(raw))
		if (!parsed) return null
		if (Date.now() - parsed.startedAt > ACTIVE_SESSION_MAX_AGE_MS) {
			clearActiveSession()
			return null
		}
		// Idle gate: a paused session (the page hid mid-test) is only resumable
		// for RESUME_MAX_IDLE_MS after the pause. Beyond that, treat the test as
		// abandoned so an unrelated return to this origin (within the 2h
		// startedAt cap, which never refreshes) can't silently re-adopt it and
		// re-acquire the mic. startedAt stays the duration anchor; pausedAt is the
		// idle clock.
		if (parsed.status === 'paused' && typeof parsed.pausedAt === 'number') {
			if (Date.now() - parsed.pausedAt > RESUME_MAX_IDLE_MS) {
				clearActiveSession()
				return null
			}
		}
		return parsed
	} catch {
		return null
	}
}

export function writeActiveSession(state: ActiveSessionState): void {
	try {
		window.localStorage?.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(state))
	} catch {
		// Storage full / blocked: resume resilience is lost but recording continues.
	}
}

export function clearActiveSession(): void {
	try {
		window.localStorage?.removeItem(ACTIVE_SESSION_STORAGE_KEY)
	} catch {
		// ignore
	}
}

// Persist the current store as the active resume state. Called when recording
// starts and after the chunk index advances. No-op until the session id exists.
export function persistActiveSession(store: RecorderStore, status: 'active' | 'paused'): void {
	if (!store.sessionId) return
	const state: ActiveSessionState = {
		slug: store.slug,
		sessionId: store.sessionId,
		nextChunkIndex: store.chunkIndex,
		startedAt: store.startedAt,
		status,
	}
	if (store.sdkSessionId) state.sdkSessionId = store.sdkSessionId
	// Stamp pausedAt when the page hides mid-test so resume eligibility can be
	// gated on idle time (see RESUME_MAX_IDLE_MS in readActiveSession). An
	// 'active' write (recording start / chunk index advance) intentionally omits
	// pausedAt: the participant is live, so the idle clock should be cleared.
	if (status === 'paused') {
		state.pausedAt = Date.now()
	}
	writeActiveSession(state)
}

export function readTesterName(override: string): string | undefined {
	if (override) return override
	try {
		const stored = window.localStorage?.getItem(TESTER_NAME_STORAGE_KEY)
		if (stored && stored.trim()) return stored.trim().slice(0, 120)
	} catch {
		// Storage access can throw in some sandboxed iframes — ignore.
	}
	return undefined
}

// Read the `uts` (user-test session) id the entry screen appends when it
// creates the session server-side. When present, the SDK ADOPTS that session
// instead of minting its own (so the session has the participant's email from
// creation, no double-session). Absent for open tests using the old link
// shape, where the SDK falls back to createSession.
export function getAdoptSessionId(): string | null {
	if (typeof window === 'undefined' || typeof window.location === 'undefined') return null
	try {
		const params = new URLSearchParams(window.location.search)
		const raw = params.get('uts')
		if (!raw) return null
		const cleaned = raw.trim().slice(0, 64)
		// Session ids are cuids: lowercase alphanumerics. Reject anything else.
		if (!/^[a-z0-9]+$/i.test(cleaned)) return null
		return cleaned
	} catch {
		return null
	}
}

export function getTestSlug(queryParam: string): string | null {
	if (typeof window === 'undefined' || typeof window.location === 'undefined') return null
	try {
		const params = new URLSearchParams(window.location.search)
		const slug = params.get(queryParam)
		if (!slug) return null
		const cleaned = slug.trim().slice(0, 64)
		if (!/^[a-z0-9-]+$/i.test(cleaned)) return null
		return cleaned
	} catch {
		return null
	}
}

export function parseTasks(raw: unknown): UserTestTask[] {
	if (!Array.isArray(raw)) return []
	const out = raw.flatMap((item: unknown): UserTestTask[] => {
		const t = item as { id?: unknown; prompt?: unknown; sortOrder?: unknown }
		if (!t || typeof t.id !== 'string' || typeof t.prompt !== 'string' || typeof t.sortOrder !== 'number') return []
		return [{ id: t.id, prompt: t.prompt, sortOrder: t.sortOrder }]
	})
	out.sort((a, b) => a.sortOrder - b.sortOrder)
	return out
}

export async function createSession(
	apiUrl: string,
	slug: string,
	testerName: string | undefined,
): Promise<{ sessionId: string; clientId: string; tasks: UserTestTask[] } | null> {
	try {
		const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/user-test-sessions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ slug, ...(testerName ? { testerName } : {}) }),
		})
		if (!res.ok) return null
		const json = (await res.json()) as { sessionId?: unknown; clientId?: unknown; tasks?: unknown }
		if (typeof json.sessionId !== 'string' || typeof json.clientId !== 'string') return null
		return { sessionId: json.sessionId, clientId: json.clientId, tasks: parseTasks(json.tasks) }
	} catch {
		return null
	}
}

// Adopt an existing session the entry screen already created (carried via the
// `uts` URL param). GET the clientId + tasks for it; we do NOT create a new
// session. Returns null on any failure so the caller can surface the error
// state (we deliberately do NOT silently fall back to createSession here: a
// present-but-unresolvable uts means something is wrong, and creating a second
// anonymous session is exactly the double-session bug we're avoiding).
export async function adoptSession(apiUrl: string, sessionId: string): Promise<AdoptResult> {
	try {
		const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/user-test-sessions/${encodeURIComponent(sessionId)}/adopt`, {
			method: 'GET',
		})
		// 409 Conflict / 410 Gone => the session is closed. Don't resurrect it.
		if (res.status === 409 || res.status === 410) return { kind: 'closed' }
		if (!res.ok) return { kind: 'error' }
		const json = (await res.json()) as { sessionId?: unknown; clientId?: unknown; tasks?: unknown }
		if (typeof json.sessionId !== 'string' || typeof json.clientId !== 'string') return { kind: 'error' }
		return { kind: 'ok', sessionId: json.sessionId, clientId: json.clientId, tasks: parseTasks(json.tasks) }
	} catch {
		return { kind: 'error' }
	}
}

export function parsePaymentSummary(raw: unknown): PaymentSummary | null {
	if (typeof raw !== 'object' || raw === null) return null
	const p = raw as {
		qualified?: unknown
		reward?: unknown
		payoutEmail?: unknown
		tasksDone?: unknown
		tasksTotal?: unknown
	}
	if (typeof p.qualified !== 'boolean') return null
	return {
		qualified: p.qualified,
		reward: typeof p.reward === 'string' ? p.reward : null,
		payoutEmail: typeof p.payoutEmail === 'string' ? p.payoutEmail : null,
		tasksDone: typeof p.tasksDone === 'number' ? p.tasksDone : 0,
		tasksTotal: typeof p.tasksTotal === 'number' ? p.tasksTotal : 0,
	}
}

export async function finaliseSession(
	apiUrl: string,
	sessionId: string,
	durationSeconds: number,
	extras: {
		mutedSegments?: MutedSegment[]
		endNote?: string | null
		notes?: FinaliseNote[]
		// Replay linkage. sdkSessionId is the primary, always-available key:
		// the server resolves the SessionReplay by (clientId + sdkSessionId)
		// and sets UserTestSession.sessionReplayId. replayOffsetMs is the
		// offset captured at session start, only present when replay was
		// active. Both optional so older servers tolerate their absence and a
		// test with no replay still finalises cleanly.
		sdkSessionId?: string
		replayOffsetMs?: number
	} = {},
): Promise<FinaliseResult> {
	try {
		const body: Record<string, unknown> = {
			durationSeconds: Math.max(0, Math.round(durationSeconds)),
		}
		if (extras.mutedSegments && extras.mutedSegments.length > 0) {
			body.mutedSegments = extras.mutedSegments
		}
		const trimmedEndNote = extras.endNote?.trim()
		if (trimmedEndNote) body.endNote = trimmedEndNote
		if (extras.notes && extras.notes.length > 0) {
			// Server caps at 200; trim defensively here too.
			body.notes = extras.notes.slice(0, 200).map(n => ({
				atMs: Math.max(0, Math.round(n.atMs)),
				text: n.text,
			}))
		}
		if (extras.sdkSessionId) body.sdkSessionId = extras.sdkSessionId
		if (typeof extras.replayOffsetMs === 'number') {
			body.replayOffsetMs = Math.max(0, Math.round(extras.replayOffsetMs))
		}
		const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/user-test-sessions/${encodeURIComponent(sessionId)}/finalise`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			keepalive: true,
		})
		if (!res.ok) return { ok: false, payment: null }
		let payment: PaymentSummary | null = null
		try {
			const json = (await res.json()) as { payment?: unknown }
			payment = parsePaymentSummary(json.payment)
		} catch {
			// Older server or non-JSON body: degrade to neutral thanks screen.
		}
		return { ok: true, payment }
	} catch {
		return { ok: false, payment: null }
	}
}

// POST the participant's payout destination to the SaaS side. Best-effort with a
// single retry; the destination defaults server-side to the testerEmail when we
// send only `method`, so a dropped call still leaves a payable session. Returns
// ok so the UI can confirm or surface a soft error.
export async function postPayout(
	apiUrl: string,
	sessionId: string,
	destination: string | null,
	logger: Logger,
): Promise<boolean> {
	const url = `${apiUrl.replace(/\/$/, '')}/api/user-test-sessions/${encodeURIComponent(sessionId)}/payout`
	const body: Record<string, unknown> = { method: 'email' }
	if (destination) body.destination = destination
	for (let attempt = 0; attempt < 2; attempt += 1) {
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
				keepalive: true,
			})
			if (res.ok) return true
			// 4xx won't improve on retry (bad email, etc.).
			if (res.status >= 400 && res.status < 500) {
				logger.warn(`payout rejected with ${res.status}`)
				return false
			}
		} catch (err) {
			logger.warn(`payout attempt ${attempt + 1} failed`, err)
		}
		await new Promise(resolve => setTimeout(resolve, 400 + Math.floor(Math.random() * 200)))
	}
	return false
}

export async function postNoteOnce(
	apiUrl: string,
	sessionId: string,
	atMs: number,
	text: string,
	logger: Logger,
): Promise<PostNoteResult> {
	try {
		const res = await fetch(`${apiUrl.replace(/\/$/, '')}/api/user-test-sessions/${encodeURIComponent(sessionId)}/notes`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ atMs: Math.max(0, Math.round(atMs)), text }),
			keepalive: true,
		})
		if (!res.ok) {
			logger.warn(`note POST rejected with ${res.status}`)
			return { ok: false, transient: res.status >= 500 || res.status === 408 || res.status === 429 }
		}
		// Best-effort id extraction; failures here don't matter for ack.
		let id: string | undefined
		try {
			const json = (await res.json()) as { id?: unknown }
			if (typeof json.id === 'string') id = json.id
		} catch { /* ignore */ }
		return { ok: true, id, transient: false }
	} catch (err) {
		logger.warn('note POST failed', err)
		return { ok: false, transient: true }
	}
}

// One immediate retry on transient errors. If still failing, defer to
// finalise batching via the un-acked notes channel.
export async function postNoteWithRetry(
	apiUrl: string,
	sessionId: string,
	atMs: number,
	text: string,
	logger: Logger,
): Promise<PostNoteResult> {
	const first = await postNoteOnce(apiUrl, sessionId, atMs, text, logger)
	if (first.ok || !first.transient) return first
	await new Promise(resolve => setTimeout(resolve, 400 + Math.floor(Math.random() * 200)))
	return postNoteOnce(apiUrl, sessionId, atMs, text, logger)
}
