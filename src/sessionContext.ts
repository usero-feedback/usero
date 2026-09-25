// Recording mode (public option `recording`): the mode fetch, the consent
// copy, and the "Ask first" prompt UI.
//
// Decides whether session replay records, and whether a page snapshot is
// attached to a feedback submission. Three modes, set by the client under
// Settings, Session replay, and fetched once per page load:
//
//   'always' - record ambiently, as the SDK has always done. If no
//              recording is live at submit time, capture a single page
//              snapshot instead so the feedback still has context.
//   'ask'    - never record ambiently. At submit time, ask the user
//              BEFORE anything is captured or sent. Decline means the
//              snapshot is never taken, so there is nothing to discard.
//   'never'  - capture nothing, ever. Replay never bootstraps and rrweb
//              is never loaded.
//
// The mode lives in memory for the life of the page only. It is
// deliberately NOT cached in localStorage: a client who flips the setting
// to 'never' should have that honoured on the next page load, not
// whenever a cache happens to expire. The server enforces the mode
// independently on every write, so a stale or spoofed client value cannot
// widen what gets stored.
//
// On any fetch failure we fall back to 'always', which is exactly the
// behaviour the SDK had before this feature existed. A network blip must
// not silently change what a client's install does.

import type { PluginLogger } from './plugin'

export type SessionContextMode = 'always' | 'ask' | 'never'

// The mode used when the config fetch fails or returns something we don't
// recognise. Matches pre-feature behaviour.
export const DEFAULT_SESSION_CONTEXT_MODE: SessionContextMode = 'always'

// ALL user-facing consent wording lives here, in one place, so it can be
// changed without touching any logic. Keep it to one plain sentence and
// two unambiguous choices.
export const SESSION_CONTEXT_CONSENT_COPY = {
	question: 'Include a snapshot of this page so we can see what you saw?',
	includeLabel: 'Include',
	declineLabel: "Don't include",
	// Screen-reader label for the prompt as a whole.
	ariaLabel: 'Page snapshot consent',
} as const

// How long the prompt waits for a choice before treating silence as a
// decline. Long enough to read one sentence and click, short enough that a
// user who walked away is not left with a stuck submit.
export const SESSION_CONTEXT_CONSENT_TIMEOUT_MS = 15_000

// Budget for the config fetch. It runs at init, off the critical path, but
// the submit path awaits it, so it cannot hang forever.
const CONFIG_FETCH_TIMEOUT_MS = 5000

export function isSessionContextMode(value: unknown): value is SessionContextMode {
	return value === 'always' || value === 'ask' || value === 'never'
}

function joinUrl(apiUrl: string, path: string): string {
	return `${apiUrl.replace(/\/$/, '')}${path}`
}

// Reads `settings.sessionContext` off the widget config endpoint. Returns
// the default mode on any failure: non-200, malformed body, unknown mode
// string, network error, or timeout.
export async function fetchSessionContextMode(
	apiUrl: string,
	clientId: string,
): Promise<SessionContextMode> {
	try {
		const url = `${joinUrl(apiUrl, '/api/feedback')}?clientId=${encodeURIComponent(clientId)}`
		const res = await fetch(url, {
			method: 'GET',
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(CONFIG_FETCH_TIMEOUT_MS),
		})
		if (!res.ok) return DEFAULT_SESSION_CONTEXT_MODE
		const json: unknown = await res.json()
		if (typeof json !== 'object' || json === null) return DEFAULT_SESSION_CONTEXT_MODE
		const settings = (json as { settings?: unknown }).settings
		if (typeof settings !== 'object' || settings === null) return DEFAULT_SESSION_CONTEXT_MODE
		const mode = (settings as { sessionContext?: unknown }).sessionContext
		return isSessionContextMode(mode) ? mode : DEFAULT_SESSION_CONTEXT_MODE
	} catch {
		return DEFAULT_SESSION_CONTEXT_MODE
	}
}

const CONSENT_STYLES = `
:host { all: initial; }
.backdrop {
	position: fixed;
	inset: 0;
	z-index: 2147483647;
	display: flex;
	align-items: flex-end;
	justify-content: center;
	padding: 24px;
	background: rgba(17, 17, 17, 0.28);
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}
.card {
	box-sizing: border-box;
	width: 100%;
	max-width: 380px;
	background: #ffffff;
	color: #1a1a1a;
	border: 1px solid #e4e4e4;
	border-radius: 12px;
	padding: 18px;
	box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
}
.question {
	margin: 0 0 14px;
	font-size: 14px;
	line-height: 1.45;
}
.actions {
	display: flex;
	gap: 8px;
	justify-content: flex-end;
}
button {
	font: inherit;
	font-size: 13px;
	font-weight: 500;
	padding: 8px 14px;
	border-radius: 8px;
	cursor: pointer;
	border: 1px solid transparent;
}
button:focus-visible { outline: 2px solid #1a1a1a; outline-offset: 2px; }
.decline { background: transparent; color: #4a4a4a; border-color: #d8d8d8; }
.decline:hover { background: #f5f5f5; }
.include { background: #1a1a1a; color: #ffffff; }
.include:hover { background: #333333; }
@media (prefers-color-scheme: dark) {
	.card { background: #1c1c1c; color: #f2f2f2; border-color: #333333; }
	.decline { color: #cfcfcf; border-color: #3d3d3d; }
	.decline:hover { background: #262626; }
	.include { background: #f2f2f2; color: #141414; }
	.include:hover { background: #dcdcdc; }
	button:focus-visible { outline-color: #f2f2f2; }
}
`

export interface ConsentPromptOptions {
	logger: PluginLogger
	// Silence counts as a decline after this long. Defaults to
	// SESSION_CONTEXT_CONSENT_TIMEOUT_MS.
	timeoutMs?: number
}

// Shows the consent prompt and resolves with the user's choice.
//
// Resolves `false` (decline) on timeout, on Escape, and on any failure to
// render. Callers MUST treat a `false` as "capture nothing": the whole
// point of asking first is that a declined snapshot is never taken, so
// there is never a copy of it to leak.
//
// The prompt lives in its own shadow root on a host marked
// `data-usero-block`, so host page CSS cannot restyle it and any recorder
// running elsewhere on the page skips the subtree. The host is removed
// from the DOM BEFORE the promise resolves, so a snapshot taken by the
// caller can never contain our own prompt.
export function requestSessionContextConsent(options: ConsentPromptOptions): Promise<boolean> {
	const { logger } = options
	const timeoutMs = options.timeoutMs ?? SESSION_CONTEXT_CONSENT_TIMEOUT_MS
	if (typeof document === 'undefined' || !document.body) return Promise.resolve(false)

	return new Promise<boolean>(resolve => {
		let settled = false
		let host: HTMLElement | null = null
		let timer: ReturnType<typeof setTimeout> | null = null
		let keydownHandler: ((event: KeyboardEvent) => void) | null = null

		const finish = (consented: boolean): void => {
			if (settled) return
			settled = true
			if (timer !== null) clearTimeout(timer)
			if (keydownHandler) {
				try {
					document.removeEventListener('keydown', keydownHandler, true)
				} catch {
					// Listener removal cannot be allowed to swallow the answer.
				}
			}
			// Tear the prompt down BEFORE resolving so the caller's snapshot
			// never captures it.
			if (host) {
				try {
					host.remove()
				} catch {
					// Already detached.
				}
				host = null
			}
			resolve(consented)
		}

		try {
			host = document.createElement('div')
			host.setAttribute('data-usero-session-context-consent', 'true')
			host.setAttribute('data-usero-block', 'true')
			const root = host.attachShadow({ mode: 'open' })

			const style = document.createElement('style')
			style.textContent = CONSENT_STYLES
			root.appendChild(style)

			const backdrop = document.createElement('div')
			backdrop.className = 'backdrop'

			const card = document.createElement('div')
			card.className = 'card'
			card.setAttribute('role', 'dialog')
			card.setAttribute('aria-modal', 'true')
			card.setAttribute('aria-label', SESSION_CONTEXT_CONSENT_COPY.ariaLabel)

			const question = document.createElement('p')
			question.className = 'question'
			question.textContent = SESSION_CONTEXT_CONSENT_COPY.question

			const actions = document.createElement('div')
			actions.className = 'actions'

			const declineButton = document.createElement('button')
			declineButton.type = 'button'
			declineButton.className = 'decline'
			declineButton.textContent = SESSION_CONTEXT_CONSENT_COPY.declineLabel
			declineButton.addEventListener('click', () => finish(false))

			const includeButton = document.createElement('button')
			includeButton.type = 'button'
			includeButton.className = 'include'
			includeButton.textContent = SESSION_CONTEXT_CONSENT_COPY.includeLabel
			includeButton.addEventListener('click', () => finish(true))

			actions.appendChild(declineButton)
			actions.appendChild(includeButton)
			card.appendChild(question)
			card.appendChild(actions)
			backdrop.appendChild(card)
			root.appendChild(backdrop)
			document.body.appendChild(host)

			// Escape declines. Captured so a host page key handler cannot
			// swallow it first.
			keydownHandler = (event: KeyboardEvent): void => {
				if (event.key === 'Escape') finish(false)
			}
			document.addEventListener('keydown', keydownHandler, true)

			try {
				includeButton.focus()
			} catch {
				// Focus is a nicety, not a requirement.
			}
		} catch (err) {
			logger.warn('Ask first prompt failed to render', err)
			finish(false)
			return
		}

		timer = setTimeout(() => finish(false), timeoutMs)
	})
}
