// Framework-free Usero widget. Renders into a shadow root attached to a
// container <div> on document.body so host page styles cannot bleed in
// and our class names cannot collide with the host's.
//
// API:
//   const widget = initUseroFeedbackWidget({ clientId: '...' })
//   widget.destroy()
//
// The endpoint and request shape match the React widget exactly so a
// feedback row created here is indistinguishable from one created via React.

import { FeedbackApiClient } from './api'
import { getGradientEnd } from './colorUtils'
import {
	buildFeedbackSubmission,
	createIdentityHandle,
	createPluginRuntime,
	submitWithPlugins,
} from './core'
import { __test__ as identityTestHooks } from './identity'
import { type UseroPlugin } from './plugin'
import { DEFAULT_API_URL, type UseroUser } from './types'
import {
	DARK_THEME,
	DEFAULT_THEME,
	EMOJI_BACKGROUNDS,
	EMOJI_MAP,
	type FeedbackData,
	type FeedbackRating,
	type FeedbackSubmission,
	type FeedbackWidgetProps,
	mergeTheme,
	RATING_LABELS,
	type ScreenshotData,
	type WidgetPosition,
	type WidgetTheme,
} from './types'
import { validateFeedbackSubmission } from './validation'
import {
	__test__ as whatsNewTestHooks,
	fetchWhatsNewFeed,
	getUnreadCount,
	markAllSeen,
	type WhatsNewFeed,
} from './whatsNew'
import { FEEDBACK_CSS } from './widgetCss'

export {
	DARK_THEME,
	DEFAULT_THEME,
	mergeTheme,
}

// Test-only re-export of the identity module's internal hooks (identity.ts is
// bundled into this entry, so it has no standalone dist file to import from).
// Not part of the public API; used by tests/identity-sdk-session.test.mjs to
// exercise reseatSdkSessionId, the resume-across-hard-nav replay-link fix.
export const __identityTest__ = identityTestHooks

// Test-only re-export of the what's-new module's pure logic (bundled into
// this entry, no standalone dist file). Not part of the public API; used
// by tests/whats-new.test.mjs.
export const __whatsNewTest__ = whatsNewTestHooks

export type {
	WhatsNewEntry,
	WhatsNewFeed,
	WhatsNewYours,
} from './whatsNew'

// Pick the base theme to merge user overrides onto, based on the OS color
// scheme. Defaults to dark when matchMedia is unavailable (SSR, old browsers)
// or when neither dark nor light is explicitly preferred.
function resolveBaseTheme(): WidgetTheme {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return DARK_THEME
	}
	if (window.matchMedia('(prefers-color-scheme: dark)').matches) return DARK_THEME
	if (window.matchMedia('(prefers-color-scheme: light)').matches) return DEFAULT_THEME
	return DARK_THEME
}

// Resolve the effective theme. If the caller passed a partial theme, it wins
// per-key over the OS-resolved base. If they passed nothing, we just use the
// OS-resolved base directly.
export function resolveTheme(userTheme: Partial<WidgetTheme> | undefined): WidgetTheme {
	const base = resolveBaseTheme()
	if (!userTheme) return base
	return { ...base, ...userTheme }
}
export type {
	FeedbackData,
	FeedbackRating,
	FeedbackSubmission,
	FeedbackWidgetProps,
	ScreenshotData,
	WidgetPosition,
	WidgetTheme,
} from './types'
export type {
	PluginContext,
	PluginLogger,
	UseroPlugin,
} from './plugin'

export interface UseroWidgetHandle {
	destroy: () => void
	open: () => void
	close: () => void
	// Hot-swap any subset of props EXCEPT `clientId` and `baseUrl`. Changing
	// those requires destroy + re-init (the API client is bound to baseUrl,
	// and clientId is the identity of the widget). Callers (e.g. the React
	// wrapper) typically route callbacks through this so identity changes on
	// re-render don't force a tear-down.
	update: (next: Partial<Omit<FeedbackWidgetProps, 'clientId' | 'baseUrl'>>) => void
	// Imperative identify(). Documented as a fallback for setups that
	// cannot expose user state via the declarative `user` prop or
	// `getUser` getter. Internally just routes through the same dedupe
	// pipeline as the declarative path.
	identify: (user: UseroUser | null) => void
	// Resolves once every plugin's `onInit` promise has settled (fulfilled
	// OR rejected). Intended for end-to-end tests and dogfooding scripts
	// that want to trigger a synthetic submit only after plugins are live.
	// Plugins with synchronous `onInit` make this resolve on the next
	// microtask. If no plugins are registered, it resolves immediately.
	whenReady: () => Promise<void>
	// Open the panel directly on the What's new view. No-ops back to the
	// regular feedback view when `whatsNew` is off or the feed is empty /
	// failed to load (the panel still opens).
	openWhatsNew: () => void
}

const EMAIL_STORAGE_KEY = 'feedback_user_email'

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, ch => {
		switch (ch) {
			case '&':
				return '&amp;'
			case '<':
				return '&lt;'
			case '>':
				return '&gt;'
			case '"':
				return '&quot;'
			case "'":
				return '&#x27;'
			default:
				return ch
		}
	})
}

// Moved to core.ts (shared with `@usero/sdk/headless`); re-exported here
// because it has always been part of this entry's public surface.
export { mergePluginPatches } from './core'

function readStoredEmail(): string {
	if (typeof window === 'undefined') return ''
	try {
		return window.localStorage.getItem(EMAIL_STORAGE_KEY) ?? ''
	} catch {
		return ''
	}
}

function writeStoredEmail(email: string): void {
	try {
		window.localStorage.setItem(EMAIL_STORAGE_KEY, email)
	} catch {
		// ignore
	}
}

export function initUseroFeedbackWidget(
	props: FeedbackWidgetProps,
): UseroWidgetHandle {
	if (typeof document === 'undefined') {
		return {
			destroy: () => {},
			open: () => {},
			close: () => {},
			update: () => {},
			whenReady: () => Promise.resolve(),
			identify: () => {},
			openWhatsNew: () => {},
		}
	}

	const { clientId, baseUrl } = props

	if (!clientId || clientId.length < 3) {
		const err = new Error('Invalid config. Contact admin.')
		props.onError?.(err)
		return {
			destroy: () => {},
			open: () => {},
			close: () => {},
			update: () => {},
			whenReady: () => Promise.resolve(),
			identify: () => {},
			openWhatsNew: () => {},
		}
	}

	// Mutable view of every prop that can be hot-swapped via update(). Read
	// these at render time, never destructure into local const above the
	// render closures or you'll capture stale values.
	let position: WidgetPosition = props.position ?? 'right'
	let userThemeOverride: Partial<WidgetTheme> | undefined = props.theme
	let theme: WidgetTheme = resolveTheme(userThemeOverride)
	let title: string = props.title ?? 'Share Feedback'
	let placeholder: string = props.placeholder ?? 'Tell us what you think... (optional)'
	let showEmailOption: boolean = props.showEmailOption ?? true
	let showScreenshotOption: boolean = props.showScreenshotOption ?? true
	let environment: string | undefined = props.environment
	let metadata: Record<string, unknown> | undefined = props.metadata
	let onSubmit: FeedbackWidgetProps['onSubmit'] = props.onSubmit
	let onError: FeedbackWidgetProps['onError'] = props.onError
	let onOpen: FeedbackWidgetProps['onOpen'] = props.onOpen
	let onClose: FeedbackWidgetProps['onClose'] = props.onClose
	let whatsNewEnabled: boolean = props.whatsNew ?? false
	const apiClient = new FeedbackApiClient(baseUrl)

	// Last-seen user refs, tracked alongside the identity handle so the
	// what's-new fetch can attach the identified user's email. `undefined`
	// means "no user prop supplied, defer to getUser"; `null` means
	// explicitly logged out.
	let lastKnownUser: UseroUser | null | undefined = props.user
	let getUserRef: FeedbackWidgetProps['getUser'] = props.getUser

	function resolveWhatsNewEmail(): string | undefined {
		if (lastKnownUser) return lastKnownUser.email
		if (lastKnownUser === null) return undefined
		if (getUserRef) {
			try {
				return getUserRef()?.email
			} catch {
				return undefined
			}
		}
		return undefined
	}

	// Identity resolution lives in the shared core (same logic drives
	// `@usero/sdk/headless`): user-prop-over-getUser precedence, reference
	// short-circuit, identify dedupe, logout rotation. The handle does the
	// initial resolve at creation time.
	const identity = createIdentityHandle(
		{ apiUrl: baseUrl ?? DEFAULT_API_URL, clientId },
		{ user: props.user, getUser: props.getUser },
	)

	// Plugin runtime lives in the shared core too: per-plugin contexts,
	// fire-and-forget onInit with the whenReady() barrier, submit-hook
	// merging, and onDestroy teardown.
	const pluginRuntime = createPluginRuntime({
		clientId,
		apiUrl: baseUrl ?? DEFAULT_API_URL,
		plugins: props.plugins ?? [],
		resolveUser: () => identity.resolveUser(),
		environment,
	})

	// State
	let isOpen = false
	let focusCommentNext = false
	let selectedRating: FeedbackRating | undefined = undefined
	let comment = ''
	let shareEmail = false
	let userEmail = readStoredEmail()
	let isSubmitting = false
	let submitMessage: { type: 'success' | 'error'; text: string } | null = null
	let screenshots: ScreenshotData[] = []
	let isUploadingScreenshot = false
	let screenshotError: string | null = null

	// What's-new state. The feed is fetched at most once per widget
	// instance (no polling in v1). `null` feed means "not loaded yet, or
	// load failed, or feature off": all render sites treat it as absent.
	let whatsNewFeed: WhatsNewFeed | null = null
	let whatsNewUnread = 0
	let whatsNewFetchStarted = false
	let activeView: 'feedback' | 'whats-new' = 'feedback'

	const MAX_SCREENSHOTS = 3
	const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024 // 10MB, matches old React widget

	// Host element on the page. ShadowRoot keeps host CSS isolated.
	const host = document.createElement('div')
	host.setAttribute('data-usero-widget', '')
	// position: static so the host element doesn't take any space; the
	// fixed-position children inside the shadow root anchor to the viewport.
	host.style.cssText = 'all: initial;'
	document.body.appendChild(host)
	const root = host.attachShadow({ mode: 'open' })

	// Notify recording plugins (e.g. session-replay) that a shadow root they
	// need to observe has just been mounted into the page. rrweb's automatic
	// shadow-root traversal only catches roots that exist at record-start
	// time (via the initial full snapshot) OR that get attached as part of
	// a new node addition observed by its MutationObserver. Our widget host
	// is appended to <body> first and `attachShadow` is called immediately
	// after, so the observed mutation does not yet have a shadowRoot. The
	// session-replay plugin handles this signal by re-taking a full
	// snapshot, which causes rrweb to walk into and start observing this
	// shadow tree. Dispatched as a CustomEvent on window so the plugin
	// stays decoupled from the widget.
	// Re-poll getUser at widget interaction boundaries (panel open, mount).
	// This catches "user logged in while widget was idle" without setting
	// up a polling timer that would tick on background tabs. Identify dedupe
	// via fingerprint inside identifyIfChanged means same-user re-polls are
	// no-ops on the network.
	function pollGetUser(): void {
		identity.resolveUser()
	}

	function notifyShadowUpdate(reason: 'mount' | 'panel-open'): void {
		try {
			window.dispatchEvent(
				new CustomEvent('usero:shadow-update', {
					detail: { host, root, reason },
				}),
			)
		} catch {
			// Older browsers without CustomEvent / dispatchEvent: best-effort.
		}
	}
	notifyShadowUpdate('mount')

	// Inject styles once into the shadow root.
	const style = document.createElement('style')
	style.textContent = FEEDBACK_CSS
	root.appendChild(style)

	// Containers
	const buttonEl = document.createElement('button')
	const backdropEl = document.createElement('div')
	const panelEl = document.createElement('div')
	root.appendChild(buttonEl)
	root.appendChild(backdropEl)
	root.appendChild(panelEl)

	function setSubmitMessage(
		next: { type: 'success' | 'error'; text: string } | null,
	): void {
		submitMessage = next
		render()
	}

	function open(): void {
		if (isOpen) return
		isOpen = true
		focusCommentNext = true
		// Reset transient state
		activeView = 'feedback'
		selectedRating = undefined
		comment = ''
		shareEmail = false
		submitMessage = null
		screenshots = []
		screenshotError = null
		isUploadingScreenshot = false
		apiClient.ping()
		pollGetUser()
		onOpen?.()
		render()
		// The panel's interactive content is `innerHTML`-ed inside the shadow
		// root on first render, which IS observable by rrweb's MutationObserver
		// as long as the shadow root is registered. Re-fire the signal so a
		// recorder that started before the widget mounted (or before the panel
		// rendered its first interactive markup) re-snapshots and observes the
		// shadow root from this point on.
		notifyShadowUpdate('panel-open')
	}

	async function handleScreenshotFile(file: File): Promise<void> {
		screenshotError = null
		if (!file.type.startsWith('image/')) {
			screenshotError = 'Image files only'
			updateUploadExtras()
			return
		}
		if (file.size > MAX_SCREENSHOT_BYTES) {
			screenshotError = 'Max 10MB'
			updateUploadExtras()
			return
		}
		if (screenshots.length >= MAX_SCREENSHOTS) {
			screenshotError = `Max ${MAX_SCREENSHOTS} screenshots`
			updateUploadExtras()
			return
		}

		isUploadingScreenshot = true
		// Surgical updates only. A full render() here would rebuild the panel
		// innerHTML and destroy the comment textarea the user may be typing in,
		// stealing focus + caret + any unsynced keystrokes mid-upload.
		updateUploadButton()
		updateUploadExtras()
		try {
			const uploaded = await apiClient.uploadScreenshot(file, clientId)
			screenshots = [...screenshots, uploaded]
		} catch (err) {
			screenshotError = err instanceof Error ? err.message : 'Upload failed'
		} finally {
			isUploadingScreenshot = false
			updateUploadButton()
			updateUploadExtras()
		}
	}

	function removeScreenshot(index: number): void {
		screenshots = screenshots.filter((_, i) => i !== index)
		// Surgical update so removing a screenshot mid-typing does not blow away
		// the textarea (matches the upload path's no-full-render rule).
		updateUploadButton()
		updateUploadExtras()
	}

	function close(): void {
		if (!isOpen) return
		isOpen = false
		onClose?.()
		render()
	}

	// Fetch the what's-new feed once. Silent no-op on any failure or an
	// empty feed: no dot, no tabs, widget behaves exactly as if the flag
	// were off for this page view.
	function loadWhatsNewFeed(): void {
		if (!whatsNewEnabled || whatsNewFetchStarted) return
		whatsNewFetchStarted = true
		void (async () => {
			const feed = await fetchWhatsNewFeed({
				baseUrl: baseUrl ?? DEFAULT_API_URL,
				clientId,
				email: resolveWhatsNewEmail(),
			})
			if (destroyed) return
			if (!feed || feed.entries.length === 0) return
			whatsNewFeed = feed
			whatsNewUnread = getUnreadCount(clientId, feed.entries)
			renderButton()
			// Refresh the panel only while it is closed, so the tab header is
			// in place for the next open. A full render on an OPEN panel would
			// rebuild the innerHTML and destroy any in-progress typing; in
			// that (rare) case the tabs simply appear on the next render.
			if (!isOpen) render()
		})()
	}

	// Switch the open panel to the What's new view and mark everything as
	// seen. No-op when the feature is off or the feed is absent/empty.
	function openWhatsNewView(): void {
		if (!whatsNewEnabled || !whatsNewFeed || whatsNewFeed.entries.length === 0) {
			return
		}
		activeView = 'whats-new'
		focusCommentNext = false
		markAllSeen(clientId, whatsNewFeed.entries)
		whatsNewUnread = 0
		render()
	}

	// Inner HTML of the upload pick button (label, spinner). Built separately
	// from renderPanel so it can be applied surgically without rebuilding the
	// panel (and thus the comment textarea) during an upload. The file input is
	// a sibling of the button inside the toolrow, so it is NOT touched here.
	function buildUploadButtonInner(): string {
		return isUploadingScreenshot
			? '<span class="fb-ups"></span> Uploading...'
			: '📷 Add screenshot'
	}

	function buildUploadButtonHtml(): string {
		const atMax = screenshots.length >= MAX_SCREENSHOTS
		const btnDisabled = isUploadingScreenshot || atMax
		return `
			<input type="file" accept="image/*" data-role="screenshot-input" style="display:none;" aria-label="Choose screenshot" />
			<button type="button" class="fb-upb ${btnDisabled ? 'fb-upb--dis' : ''}" data-role="screenshot-pick" ${btnDisabled ? 'disabled' : ''} style="border:1px solid ${theme.border};color:${theme.text};">
				${buildUploadButtonInner()}
			</button>
		`
	}

	function buildUploadExtrasHtml(): string {
		const atMax = screenshots.length >= MAX_SCREENSHOTS
		const previewsHtml = screenshots
			.map(
				(shot, i) => `
					<div class="fb-sp">
						<img src="${escapeHtml(shot.url)}" alt="Screenshot ${i + 1}" class="fb-si" />
						<button type="button" class="fb-sr" data-role="screenshot-remove" data-index="${i}" aria-label="Remove screenshot">✕</button>
					</div>
				`,
			)
			.join('')
		const errorHtml = screenshotError
			? `<div class="fb-upe">⚠ ${escapeHtml(screenshotError)}</div>`
			: ''
		const limitHtml = atMax ? `<div class="fb-sl">Max ${MAX_SCREENSHOTS}</div>` : ''
		return screenshotError || screenshots.length > 0 || atMax
			? `<div class="fb-up-extras">${errorHtml}${
					screenshots.length > 0
						? `<div class="fb-ss">${previewsHtml}</div>`
						: ''
				}${limitHtml}</div>`
			: ''
	}

	// Surgically refresh ONLY the pick button (disabled state + label/spinner)
	// without rebuilding its parents. Leaves the comment textarea, its focus,
	// caret, and any in-progress text untouched. No-op if the panel is not
	// currently rendered (e.g. closed) or the screenshot option is off.
	function updateUploadButton(): void {
		if (!showScreenshotOption) return
		const pickBtn = panelEl.querySelector<HTMLButtonElement>(
			'button[data-role="screenshot-pick"]',
		)
		if (!pickBtn) return
		const atMax = screenshots.length >= MAX_SCREENSHOTS
		const btnDisabled = isUploadingScreenshot || atMax
		pickBtn.disabled = btnDisabled
		pickBtn.classList.toggle('fb-upb--dis', btnDisabled)
		pickBtn.innerHTML = buildUploadButtonInner()
	}

	// Surgically re-render ONLY the upload extras container (error, previews,
	// max-limit notice) and reattach the remove-button listeners inside it.
	// Nothing outside `.fb-up` is touched, so the textarea survives.
	function updateUploadExtras(): void {
		if (!showScreenshotOption) return
		const container = panelEl.querySelector<HTMLDivElement>('.fb-up')
		if (!container) return
		container.innerHTML = buildUploadExtrasHtml()
		container
			.querySelectorAll<HTMLButtonElement>('button[data-role="screenshot-remove"]')
			.forEach(btn => {
				btn.addEventListener('click', () => {
					const idx = Number(btn.dataset.index)
					if (Number.isInteger(idx)) removeScreenshot(idx)
				})
			})
	}

	async function submitForm(): Promise<void> {
		if (isSubmitting) return
		isSubmitting = true
		submitMessage = null
		render()

		const feedbackData: FeedbackData = {
			rating: selectedRating,
			comment: comment.trim() || undefined,
			userEmail: shareEmail && userEmail.trim() ? userEmail.trim() : undefined,
			screenshots: screenshots.length > 0 ? screenshots : undefined,
			metadata: {
				pageUrl: window.location.href,
				pageTitle: document.title || 'Untitled Page',
				referrer: document.referrer || undefined,
				timestamp: Date.now(),
			},
		}

		// Build + validate + plugin-enrich + POST all live in the shared
		// core now (see core.ts for the merge policy on plugin patches).
		// feedbackData above stays widget-local: it feeds the onSubmit
		// callback, not the wire.
		const submission = buildFeedbackSubmission({
			clientId,
			environment,
			metadata,
			payload: {
				rating: selectedRating,
				comment,
				userEmail: shareEmail ? userEmail : undefined,
				screenshots,
			},
		})

		const validation = validateFeedbackSubmission(submission)
		if (!validation.isValid) {
			isSubmitting = false
			setSubmitMessage({ type: 'error', text: validation.errors.join(', ') })
			return
		}

		try {
			const response = await submitWithPlugins(apiClient, pluginRuntime, submission)
			if (response.success) {
				if (shareEmail && userEmail) writeStoredEmail(userEmail)
				onSubmit?.(feedbackData)
				selectedRating = undefined
				comment = ''
				shareEmail = false
				screenshots = []
				screenshotError = null
				submitMessage = { type: 'success', text: 'Thank you!' }
			} else {
				const msg = response.error ?? 'Error occurred. Try again.'
				onError?.(new Error(msg))
				submitMessage = { type: 'error', text: msg }
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Error occurred. Try again.'
			onError?.(new Error(msg))
			submitMessage = { type: 'error', text: msg }
		} finally {
			isSubmitting = false
			render()
		}
	}

	// Static button content + styles (only style.background changes once)
	function renderButton(): void {
		buttonEl.className = `fb-btn fb-btn--${position} ${isOpen ? 'fb-btn--open' : ''}`
		buttonEl.setAttribute('aria-label', 'Open feedback')
		buttonEl.type = 'button'
		buttonEl.style.background = `linear-gradient(135deg, ${theme.primary}, ${getGradientEnd(theme.primary)})`
		// Minimal unread indicator; hidden while the panel is open. The
		// designer pass owns the final look.
		const dotHtml =
			whatsNewUnread > 0
				? '<span class="fb-wn-dot" data-role="wn-dot" aria-hidden="true"></span>'
				: ''
		buttonEl.innerHTML = isOpen
			? `<span style="font-size:20px;">✕</span>`
			: dotHtml
	}

	function renderBackdrop(): void {
		backdropEl.className = 'fb-backdrop'
		backdropEl.style.display = isOpen ? 'block' : 'none'
		backdropEl.setAttribute('aria-label', 'Close modal')
	}

	function formatEntryDate(iso: string): string {
		const t = Date.parse(iso)
		if (Number.isNaN(t)) return ''
		try {
			return new Date(t).toLocaleDateString(undefined, {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
			})
		} catch {
			return ''
		}
	}

	// Only ever emit http(s) links from feed data. Anything else (including
	// javascript: URLs from a compromised or buggy backend) renders as
	// plain text.
	function safeHttpUrl(url: string | null): string | null {
		if (!url) return null
		return /^https?:\/\//i.test(url) ? url : null
	}

	// Functional layout only; the designer pass restyles this view.
	function buildWhatsNewBodyHtml(feed: WhatsNewFeed): string {
		const entryBySlug = new Map(feed.entries.map(e => [e.slug, e]))
		const yoursItemsHtml = feed.yours
			.map(item => {
				const entry = entryBySlug.get(item.entrySlug)
				const itemTitle = entry ? entry.title : item.prTitle
				const quoteHtml = item.quote
					? `<div class="fb-wn-quote" style="border-left:3px solid ${theme.primary};color:${theme.text}">"${escapeHtml(item.quote)}"</div>`
					: ''
				return `
					<div class="fb-wn-yours-item">
						<div class="fb-wn-item-ttl" style="color:${theme.text}">${escapeHtml(itemTitle)}</div>
						${quoteHtml}
						<div class="fb-wn-pr" style="color:${theme.text}">Shipped via ${escapeHtml(item.prTitle)}</div>
					</div>
				`
			})
			.join('')
		const yoursSectionHtml =
			feed.yours.length > 0
				? `<div class="fb-wn-yours" style="border:1px solid ${theme.border}">
						<div class="fb-wn-sec-ttl" style="color:${theme.primary}">Shipped for you</div>
						${yoursItemsHtml}
					</div>`
				: ''
		const entriesHtml = feed.entries
			.map(entry => {
				const url = safeHttpUrl(entry.url)
				const titleHtml = url
					? `<a class="fb-wn-item-ttl fb-wn-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color:${theme.text}">${escapeHtml(entry.title)}</a>`
					: `<div class="fb-wn-item-ttl" style="color:${theme.text}">${escapeHtml(entry.title)}</div>`
				const date = formatEntryDate(entry.publishedAt)
				const excerptHtml = entry.excerpt
					? `<div class="fb-wn-excerpt" style="color:${theme.text}">${escapeHtml(entry.excerpt)}</div>`
					: ''
				return `
					<div class="fb-wn-item" style="border-bottom:1px solid ${theme.border}">
						<div class="fb-wn-meta">
							<span class="fb-wn-type" style="border:1px solid ${theme.border};color:${theme.text}">${escapeHtml(entry.type)}</span>
							${date ? `<span class="fb-wn-date" style="color:${theme.text}">${escapeHtml(date)}</span>` : ''}
						</div>
						${titleHtml}
						${excerptHtml}
					</div>
				`
			})
			.join('')
		const boardUrl = safeHttpUrl(feed.boardUrl)
		const boardLinkHtml = boardUrl
			? `<a class="fb-wn-board" href="${escapeHtml(boardUrl)}" target="_blank" rel="noopener noreferrer" style="color:${theme.primary}">See all updates</a>`
			: ''
		return `
			<div class="fb-wn">
				${yoursSectionHtml}
				<div class="fb-wn-list">${entriesHtml}</div>
				${boardLinkHtml}
			</div>
		`
	}

	function renderPanel(): void {
		panelEl.className = `fb-pnl-base fb-pnl--${position} ${
			isOpen ? 'fb-pnl--open' : 'fb-pnl--closed'
		}`
		panelEl.style.backgroundColor = theme.background
		if (position === 'right') {
			panelEl.style.borderLeft = `1px solid ${theme.border}`
			panelEl.style.borderRight = ''
		} else {
			panelEl.style.borderRight = `1px solid ${theme.border}`
			panelEl.style.borderLeft = ''
		}
		panelEl.setAttribute('role', 'dialog')
		panelEl.setAttribute('aria-modal', 'true')
		panelEl.setAttribute('aria-labelledby', 'usero-feedback-title')

		const remaining = 1000 - comment.length
		const lowChars = remaining < 50

		const ratingsHtml = ([1, 2, 3, 4] as FeedbackRating[])
			.map(r => {
				const sel = selectedRating === r
				const bg = EMOJI_BACKGROUNDS[r]
				const cls = ['fb-ec', sel && 'fb-ec--sel'].filter(Boolean).join(' ')
				// Set color on the button so .fb-el (color: currentColor) inherits
				// the themed foreground. Without this it falls back to the UA
				// default for <button>, which is black on dark backgrounds.
				return `
					<div class="${cls}" style="background:${bg}">
						<button type="button" class="fb-eb" data-rating="${r}" role="radio" aria-checked="${sel}" aria-label="${r}: ${RATING_LABELS[r]}" style="color:${theme.text}">
							<div class="fb-ei"><span role="img" aria-label="${RATING_LABELS[r]}">${EMOJI_MAP[r]}</span></div>
							<div class="fb-el" style="color:${theme.text}">${RATING_LABELS[r]}</div>
						</button>
					</div>
				`
			})
			.join('')

		const messageHtml = submitMessage
			? `<div class="fb-msg fb-msg--header ${submitMessage.type === 'success' ? 'fb-msg--ok' : 'fb-msg--err'}">${submitMessage.type === 'success' ? '✓' : '⚠'} ${escapeHtml(submitMessage.text)}</div>`
			: ''

		// The upload button + char counter share a single horizontal row to
		// keep the panel compact (matches the legacy react-feedback-collector
		// layout). Upload extras (error message, previews, max limit) live on
		// their own row beneath, so they can wrap freely.
		const uploadBtnHtml = showScreenshotOption ? buildUploadButtonHtml() : ''
		const uploadExtrasHtml = showScreenshotOption ? buildUploadExtrasHtml() : ''

		const emailBlockHtml = showEmailOption
			? `
				<div class="fb-email">
					<label class="fb-email-lbl" style="color:${theme.text}">
						<input type="checkbox" class="fb-email-cb" data-role="share-email" ${shareEmail ? 'checked' : ''} aria-label="Share email" />
						<span>Share my email</span>
					</label>
					${
						shareEmail
							? `<input type="email" class="fb-email-inp" data-role="email-input" value="${escapeHtml(userEmail)}" placeholder="your.email@example.com" aria-label="Email" maxlength="254" autocomplete="email" style="border:1px solid ${theme.border};color:${theme.text};background-color:${theme.background};" />`
							: ''
					}
				</div>
			`
			: ''

		const submitDisabled = isSubmitting
		const submitStyle = `background:linear-gradient(135deg, ${theme.primary}, ${getGradientEnd(theme.primary)});color:#ffffff;${submitDisabled ? 'opacity:0.6;cursor:not-allowed;' : ''}`

		// Two-tab header, only when the what's-new feature has entries to
		// show. Minimal structure by design; the designer pass restyles it.
		const showTabs =
			whatsNewEnabled && whatsNewFeed !== null && whatsNewFeed.entries.length > 0
		const isWhatsNewView = showTabs && activeView === 'whats-new'
		const tabsHtml = showTabs
			? `
				<div class="fb-tabs" role="tablist" aria-label="Widget views" style="border-bottom:1px solid ${theme.border}">
					<button type="button" class="fb-tab ${!isWhatsNewView ? 'fb-tab--active' : ''}" data-role="tab-feedback" role="tab" aria-selected="${!isWhatsNewView}" style="color:${theme.text};${!isWhatsNewView ? `border-bottom-color:${theme.primary};` : ''}">Feedback</button>
					<button type="button" class="fb-tab ${isWhatsNewView ? 'fb-tab--active' : ''}" data-role="tab-whats-new" role="tab" aria-selected="${isWhatsNewView}" style="color:${theme.text};${isWhatsNewView ? `border-bottom-color:${theme.primary};` : ''}">What&#x27;s new${whatsNewUnread > 0 ? `<span class="fb-tab-badge">${whatsNewUnread}</span>` : ''}</button>
				</div>
			`
			: ''

		const headerTitle = isWhatsNewView ? "What's new" : title
		const bodyHtml =
			isWhatsNewView && whatsNewFeed !== null
				? buildWhatsNewBodyHtml(whatsNewFeed)
				: `<form data-role="form">
					<div class="fb-es" role="radiogroup" aria-label="Rate experience">${ratingsHtml}</div>
					<textarea class="fb-ta" data-role="comment" placeholder="${escapeHtml(placeholder)}" aria-label="Comments" maxlength="1000" rows="2" style="border:1px solid ${theme.border};color:${theme.text};background-color:${theme.background};">${escapeHtml(comment)}</textarea>
					<div class="fb-toolrow">
						${uploadBtnHtml}
						<div class="fb-charcount${lowChars ? ' fb-charcount--low' : ''}" data-role="charcount" style="color:${lowChars ? '#dc2626' : theme.text};opacity:${lowChars ? 1 : 0.6};">${remaining} chars remaining</div>
					</div>
					${showScreenshotOption ? `<div class="fb-up">${uploadExtrasHtml}</div>` : ''}
					${emailBlockHtml}
					<button class="fb-sub ${submitDisabled ? 'fb-sub--dis' : ''}" type="submit" aria-label="Submit" ${submitDisabled ? 'disabled' : ''} style="${submitStyle}">
						${isSubmitting ? '<span class="fb-spin"></span>' : ''}
						${isSubmitting ? 'Submitting...' : 'Send Feedback 🚀'}
					</button>
				</form>`

		panelEl.innerHTML = `
			<div class="fb-cnt">
				${tabsHtml}
				<div class="fb-hdr" style="border-bottom:1px solid ${theme.border}">
					<h2 id="usero-feedback-title" class="fb-ttl" style="color:${theme.text}">${escapeHtml(headerTitle)}</h2>
					${isWhatsNewView ? '' : messageHtml}
					<button class="fb-close-btn" data-role="close" style="color:${theme.text}" aria-label="Close" type="button">✕</button>
				</div>
				${bodyHtml}
			</div>
		`

		// Tab switching. Selectors are null when tabs are not rendered, so
		// this wiring is a no-op in the plain-feedback layout. The rest of
		// the wiring below is already null-safe (optional chaining / empty
		// NodeLists), so it degrades cleanly in the what's-new view.
		panelEl
			.querySelector<HTMLButtonElement>('button[data-role="tab-feedback"]')
			?.addEventListener('click', () => {
				if (activeView === 'feedback') return
				activeView = 'feedback'
				render()
			})
		panelEl
			.querySelector<HTMLButtonElement>('button[data-role="tab-whats-new"]')
			?.addEventListener('click', () => {
				if (activeView === 'whats-new') return
				openWhatsNewView()
			})

		// Wire up panel-internal events
		const form = panelEl.querySelector<HTMLFormElement>('form[data-role="form"]')
		form?.addEventListener('submit', e => {
			e.preventDefault()
			void submitForm()
		})

		panelEl
			.querySelector<HTMLButtonElement>('button[data-role="close"]')
			?.addEventListener('click', close)

		panelEl
			.querySelectorAll<HTMLButtonElement>('button[data-rating]')
			.forEach(btn => {
				btn.addEventListener('click', () => {
					const value = btn.dataset.rating
					if (value === '1' || value === '2' || value === '3' || value === '4') {
						selectedRating = Number(value) as FeedbackRating
						focusCommentNext = true
						render()
					}
				})
			})

		const textarea = panelEl.querySelector<HTMLTextAreaElement>(
			'textarea[data-role="comment"]',
		)
		if (textarea) {
			if (focusCommentNext) {
				focusCommentNext = false
				// Defer to next frame so the browser doesn't scroll the panel
				// while it's still animating in.
				requestAnimationFrame(() => textarea.focus({ preventScroll: true }))
			}
			textarea.addEventListener('input', () => {
				if (textarea.value.length <= 1000) {
					comment = textarea.value
					// Update char count without full rerender to avoid losing focus.
					// IMPORTANT: target by stable class. A previous selector
					// `.fb-cnt form > div > div` matched the first rating tile,
					// hijacking it with the char-count text on every keystroke.
					const counter = panelEl.querySelector<HTMLDivElement>(
						'[data-role="charcount"]',
					)
					if (counter) {
						const left = 1000 - comment.length
						counter.textContent = `${left} chars remaining`
						counter.style.color = left < 50 ? '#dc2626' : theme.text
						counter.style.opacity = left < 50 ? '1' : '0.6'
					}
				}
			})
		}

		const shareCb = panelEl.querySelector<HTMLInputElement>(
			'input[data-role="share-email"]',
		)
		shareCb?.addEventListener('change', () => {
			shareEmail = shareCb.checked
			render()
		})

		const emailInp = panelEl.querySelector<HTMLInputElement>(
			'input[data-role="email-input"]',
		)
		emailInp?.addEventListener('input', () => {
			if (emailInp.value.length <= 254) {
				userEmail = emailInp.value
			}
		})

		const fileInput = panelEl.querySelector<HTMLInputElement>(
			'input[data-role="screenshot-input"]',
		)
		const pickBtn = panelEl.querySelector<HTMLButtonElement>(
			'button[data-role="screenshot-pick"]',
		)
		pickBtn?.addEventListener('click', () => {
			fileInput?.click()
		})
		fileInput?.addEventListener('change', () => {
			const file = fileInput.files?.[0]
			if (!file) return
			void handleScreenshotFile(file).finally(() => {
				if (fileInput) fileInput.value = ''
			})
		})
		panelEl
			.querySelectorAll<HTMLButtonElement>(
				'button[data-role="screenshot-remove"]',
			)
			.forEach(btn => {
				btn.addEventListener('click', () => {
					const idx = Number(btn.dataset.index)
					if (Number.isInteger(idx)) removeScreenshot(idx)
				})
			})
	}

	function render(): void {
		renderButton()
		renderBackdrop()
		renderPanel()
	}

	// Top-level event listeners
	buttonEl.addEventListener('click', () => {
		if (isOpen) close()
		else open()
	})
	backdropEl.addEventListener('click', () => {
		// Don't let an accidental backdrop tap dismiss the panel while an upload
		// or submit is in flight (it would discard in-progress feedback). The
		// explicit X and floating toggle buttons remain deliberate exits.
		if (isUploadingScreenshot || isSubmitting) return
		close()
	})

	const onKeyDown = (e: KeyboardEvent): void => {
		if (!isOpen) return
		if (e.key === 'Escape') {
			// Same guard as the backdrop: an in-flight upload/submit shouldn't be
			// abandonable by a stray Escape.
			if (isUploadingScreenshot || isSubmitting) return
			close()
		}
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault()
			void submitForm()
		}
	}
	document.addEventListener('keydown', onKeyDown)

	// Live OS color-scheme tracking. Only active while the caller has not
	// provided an explicit `theme` prop. If they later pass one via update(),
	// we detach. If they later clear it (set to undefined), we re-attach.
	let darkMql: MediaQueryList | null = null
	let mqlListener: ((ev: MediaQueryListEvent) => void) | null = null

	function detachMqlListener(): void {
		if (darkMql && mqlListener) {
			darkMql.removeEventListener('change', mqlListener)
		}
		darkMql = null
		mqlListener = null
	}

	function attachMqlListener(): void {
		if (darkMql) return
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
		darkMql = window.matchMedia('(prefers-color-scheme: dark)')
		mqlListener = () => {
			// Only react if user still hasn't overridden the theme.
			if (userThemeOverride !== undefined) return
			theme = resolveTheme(undefined)
			render()
		}
		darkMql.addEventListener('change', mqlListener)
	}

	if (userThemeOverride === undefined) attachMqlListener()

	// Initial paint
	render()

	let destroyed = false

	// Kick off the what's-new fetch (no-op when the flag is off). Runs
	// after the initial identify resolve above, so the identified email is
	// available to attach to the request.
	loadWhatsNewFeed()
	return {
		destroy: () => {
			if (destroyed) return
			destroyed = true
			document.removeEventListener('keydown', onKeyDown)
			detachMqlListener()
			pluginRuntime.destroy()
			host.remove()
		},
		open,
		close,
		whenReady: () => pluginRuntime.whenReady(),
		identify: (user: UseroUser | null) => {
			if (destroyed) return
			lastKnownUser = user
			identity.identify(user)
		},
		openWhatsNew: () => {
			if (destroyed) return
			open()
			openWhatsNewView()
		},
		update: next => {
			if (destroyed) return
			let needsRender = false
			if (next.position !== undefined && next.position !== position) {
				position = next.position
				needsRender = true
			}
			if ('theme' in next) {
				// Caller opted in/out of explicit theme control. Track the
				// override so the matchMedia listener and any further
				// resolutions know whether the user is in charge.
				userThemeOverride = next.theme
				theme = resolveTheme(userThemeOverride)
				if (userThemeOverride === undefined) attachMqlListener()
				else detachMqlListener()
				needsRender = true
			}
			if (next.title !== undefined && next.title !== title) {
				title = next.title
				needsRender = true
			}
			if (next.placeholder !== undefined && next.placeholder !== placeholder) {
				placeholder = next.placeholder
				needsRender = true
			}
			if (
				next.showEmailOption !== undefined &&
				next.showEmailOption !== showEmailOption
			) {
				showEmailOption = next.showEmailOption
				needsRender = true
			}
			if (
				next.showScreenshotOption !== undefined &&
				next.showScreenshotOption !== showScreenshotOption
			) {
				showScreenshotOption = next.showScreenshotOption
				needsRender = true
			}
			if (next.whatsNew !== undefined && next.whatsNew !== whatsNewEnabled) {
				whatsNewEnabled = next.whatsNew
				if (whatsNewEnabled) {
					loadWhatsNewFeed()
				} else if (activeView === 'whats-new') {
					activeView = 'feedback'
				}
				needsRender = true
			}
			// Non-render-affecting props: just swap refs.
			if ('environment' in next) environment = next.environment
			if ('metadata' in next) metadata = next.metadata
			if ('onSubmit' in next) onSubmit = next.onSubmit
			if ('onError' in next) onError = next.onError
			if ('onOpen' in next) onOpen = next.onOpen
			if ('onClose' in next) onClose = next.onClose
			if ('getUser' in next) {
				getUserRef = next.getUser
				identity.setGetUser(next.getUser)
			}
			// Identity: React wrapper hot-swaps `user` here on every render.
			// The identity handle dedupes (reference short-circuit plus
			// fingerprint), so passing the same user object is a no-op
			// transport-wise, and it tracks the latest prop so plugin-driven
			// re-resolves prefer the imperative path over getUser.
			if ('user' in next) {
				lastKnownUser = next.user
				identity.setUserProp(next.user)
			}
			if (needsRender) render()
		},
	}
}
