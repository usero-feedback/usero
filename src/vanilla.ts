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
	createPluginLogger,
	type PluginContext,
	type UseroPlugin,
} from './plugin'
import { DEFAULT_API_URL } from './types'
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
import { FEEDBACK_CSS } from './widgetCss'

export {
	DARK_THEME,
	DEFAULT_THEME,
	mergeTheme,
}

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
	// Resolves once every plugin's `onInit` promise has settled (fulfilled
	// OR rejected). Intended for end-to-end tests and dogfooding scripts
	// that want to trigger a synthetic submit only after plugins are live.
	// Plugins with synchronous `onInit` make this resolve on the next
	// microtask. If no plugins are registered, it resolves immediately.
	whenReady: () => Promise<void>
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

// Merge plugin onFeedbackSubmit patches into a base submission.
//
// Top-level keys: shallow-merge, later patches win wholesale.
// `metadata`: deep-merge one level. Earlier keys are preserved when later
// patches don't set them; later keys win on conflict. This means two
// plugins can both contribute `metadata: { ... }` without either erasing
// the other's keys.
export function mergePluginPatches(
	base: FeedbackSubmission,
	patches: ReadonlyArray<Partial<FeedbackSubmission> | undefined>,
): FeedbackSubmission {
	let result: FeedbackSubmission = base
	for (const patch of patches) {
		if (!patch || typeof patch !== 'object') continue
		const { metadata: patchMetadata, ...rest } = patch
		result = { ...result, ...rest }
		if (patchMetadata && typeof patchMetadata === 'object') {
			result.metadata = {
				...(result.metadata ?? {}),
				...patchMetadata,
			}
		}
	}
	return result
}

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

	const apiClient = new FeedbackApiClient(baseUrl)

	// Plugin registry. Each plugin gets its own context with a private store.
	// `onInit` is fired non-blocking so a slow plugin can't delay the first
	// paint. Errors are caught so a misbehaving plugin can't tear the widget
	// down or block submissions.
	const pluginList: ReadonlyArray<UseroPlugin> = props.plugins ?? []
	const pluginStores = new Map<string, unknown>()
	const pluginContexts = new Map<string, PluginContext>()
	// Tracks every onInit's settlement so `whenReady()` can resolve only
	// after all plugins have finished initializing. Synchronous onInits
	// resolve on the next microtask via Promise.resolve().
	const initPromises: Promise<void>[] = []
	for (const plugin of pluginList) {
		const ctx: PluginContext = {
			clientId,
			baseUrl: baseUrl ?? DEFAULT_API_URL,
			logger: createPluginLogger(plugin.name),
			getStore: <T,>() => pluginStores.get(plugin.name) as T | undefined,
			setStore: <T,>(value: T) => {
				pluginStores.set(plugin.name, value)
			},
		}
		pluginContexts.set(plugin.name, ctx)
		if (plugin.onInit) {
			const settled = (async () => {
				try {
					await plugin.onInit?.(ctx)
				} catch (err) {
					ctx.logger.error('onInit threw', err)
				}
			})()
			initPromises.push(settled)
		}
	}
	const readyPromise: Promise<void> =
		initPromises.length === 0 ? Promise.resolve() : Promise.all(initPromises).then(() => {})

	// State
	let isOpen = false
	let selectedRating: FeedbackRating | undefined = undefined
	let comment = ''
	let shareEmail = false
	let userEmail = readStoredEmail()
	let isSubmitting = false
	let submitMessage: { type: 'success' | 'error'; text: string } | null = null
	let screenshots: ScreenshotData[] = []
	let isUploadingScreenshot = false
	let screenshotError: string | null = null

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
		// Reset transient state
		selectedRating = undefined
		comment = ''
		shareEmail = false
		submitMessage = null
		screenshots = []
		screenshotError = null
		isUploadingScreenshot = false
		apiClient.ping()
		onOpen?.()
		render()
	}

	async function handleScreenshotFile(file: File): Promise<void> {
		screenshotError = null
		if (!file.type.startsWith('image/')) {
			screenshotError = 'Image files only'
			render()
			return
		}
		if (file.size > MAX_SCREENSHOT_BYTES) {
			screenshotError = 'Max 10MB'
			render()
			return
		}
		if (screenshots.length >= MAX_SCREENSHOTS) {
			screenshotError = `Max ${MAX_SCREENSHOTS} screenshots`
			render()
			return
		}

		isUploadingScreenshot = true
		render()
		try {
			const uploaded = await apiClient.uploadScreenshot(file, clientId)
			screenshots = [...screenshots, uploaded]
		} catch (err) {
			screenshotError = err instanceof Error ? err.message : 'Upload failed'
		} finally {
			isUploadingScreenshot = false
			render()
		}
	}

	function removeScreenshot(index: number): void {
		screenshots = screenshots.filter((_, i) => i !== index)
		render()
	}

	function close(): void {
		if (!isOpen) return
		isOpen = false
		onClose?.()
		render()
	}

	async function submitForm(): Promise<void> {
		if (isSubmitting) return
		isSubmitting = true
		submitMessage = null
		render()

		const feedbackData: FeedbackData = {
			rating: selectedRating,
			comment: comment.trim() || undefined,
			userEmail: shareEmail ? userEmail : undefined,
			screenshots: screenshots.length > 0 ? screenshots : undefined,
			metadata: {
				pageUrl: window.location.href,
				pageTitle: document.title || 'Untitled Page',
				referrer: document.referrer || undefined,
				timestamp: Date.now(),
			},
		}

		const submission: FeedbackSubmission = {
			clientId,
			rating: feedbackData.rating,
			comment: feedbackData.comment,
			userEmail: feedbackData.userEmail,
			pageUrl: feedbackData.metadata.pageUrl,
			pageTitle: feedbackData.metadata.pageTitle,
			referrer: feedbackData.metadata.referrer,
			environment,
		}
		if (screenshots.length > 0) submission.screenshots = screenshots
		if (metadata !== undefined) submission.metadata = metadata

		const validation = validateFeedbackSubmission(submission)
		if (!validation.isValid) {
			isSubmitting = false
			setSubmitMessage({ type: 'error', text: validation.errors.join(', ') })
			return
		}

		// Run plugin onFeedbackSubmit hooks in parallel and merge the
		// returned partial payloads into the outgoing submission. A plugin
		// that throws or rejects is logged and skipped — never blocks submit.
		//
		// Merge policy:
		//   - `metadata` is DEEP-merged (one level): later plugins' keys
		//     win on conflict, but non-conflicting keys from earlier
		//     plugins are preserved. metadata is the natural collision
		//     point (every plugin wants to attach context) so deep merge
		//     is what users expect.
		//   - Every other top-level key is shallow-merged: later plugins
		//     win wholesale. This is fine in practice because dedicated
		//     keys like `replayEvents` have a single writer.
		let enrichedSubmission: FeedbackSubmission = submission
		if (pluginList.length > 0) {
			const patchPromises = pluginList.map(async plugin => {
				if (!plugin.onFeedbackSubmit) return undefined
				const ctx = pluginContexts.get(plugin.name)
				if (!ctx) return undefined
				try {
					return await plugin.onFeedbackSubmit(ctx, submission)
				} catch (err) {
					ctx.logger.error('onFeedbackSubmit threw', err)
					return undefined
				}
			})
			const patches = await Promise.all(patchPromises)
			enrichedSubmission = mergePluginPatches(submission, patches)
		}

		try {
			const response = await apiClient.submitFeedback(enrichedSubmission)
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
		buttonEl.innerHTML = isOpen
			? `<span style="font-size:20px;">✕</span>`
			: ''
	}

	function renderBackdrop(): void {
		backdropEl.className = 'fb-backdrop'
		backdropEl.style.display = isOpen ? 'block' : 'none'
		backdropEl.setAttribute('aria-label', 'Close modal')
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
		const uploadBtnHtml = showScreenshotOption
			? (() => {
					const atMax = screenshots.length >= MAX_SCREENSHOTS
					const btnDisabled = isUploadingScreenshot || atMax
					return `
						<input type="file" accept="image/*" data-role="screenshot-input" style="display:none;" aria-label="Choose screenshot" />
						<button type="button" class="fb-upb ${btnDisabled ? 'fb-upb--dis' : ''}" data-role="screenshot-pick" ${btnDisabled ? 'disabled' : ''} style="border:1px solid ${theme.border};color:${theme.text};">
							${
								isUploadingScreenshot
									? '<span class="fb-ups"></span> Uploading...'
									: '📷 Add screenshot'
							}
						</button>
					`
				})()
			: ''
		const uploadExtrasHtml = showScreenshotOption
			? (() => {
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
					const limitHtml = atMax
						? `<div class="fb-sl">Max ${MAX_SCREENSHOTS}</div>`
						: ''
					return screenshotError || screenshots.length > 0 || atMax
						? `<div class="fb-up-extras">${errorHtml}${
								screenshots.length > 0
									? `<div class="fb-ss">${previewsHtml}</div>`
									: ''
							}${limitHtml}</div>`
						: ''
				})()
			: ''

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

		panelEl.innerHTML = `
			<div class="fb-cnt">
				<div class="fb-hdr" style="border-bottom:1px solid ${theme.border}">
					<h2 id="usero-feedback-title" class="fb-ttl" style="color:${theme.text}">${escapeHtml(title)}</h2>
					${messageHtml}
					<button class="fb-close-btn" data-role="close" style="color:${theme.text}" aria-label="Close" type="button">✕</button>
				</div>
				<form data-role="form">
					<div class="fb-es" role="radiogroup" aria-label="Rate experience">${ratingsHtml}</div>
					<textarea class="fb-ta" data-role="comment" placeholder="${escapeHtml(placeholder)}" aria-label="Comments" maxlength="1000" rows="2" style="border:1px solid ${theme.border};color:${theme.text};background-color:${theme.background};">${escapeHtml(comment)}</textarea>
					<div class="fb-toolrow">
						${uploadBtnHtml}
						<div class="fb-charcount${lowChars ? ' fb-charcount--low' : ''}" data-role="charcount" style="color:${lowChars ? '#dc2626' : theme.text};opacity:${lowChars ? 1 : 0.6};">${remaining} chars remaining</div>
					</div>
					${uploadExtrasHtml ? `<div class="fb-up">${uploadExtrasHtml}</div>` : ''}
					${emailBlockHtml}
					<button class="fb-sub ${submitDisabled ? 'fb-sub--dis' : ''}" type="submit" aria-label="Submit" ${submitDisabled ? 'disabled' : ''} style="${submitStyle}">
						${isSubmitting ? '<span class="fb-spin"></span>' : ''}
						${isSubmitting ? 'Submitting...' : 'Send Feedback 🚀'}
					</button>
				</form>
			</div>
		`

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
						render()
					}
				})
			})

		const textarea = panelEl.querySelector<HTMLTextAreaElement>(
			'textarea[data-role="comment"]',
		)
		if (textarea) {
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
	backdropEl.addEventListener('click', close)

	const onKeyDown = (e: KeyboardEvent): void => {
		if (!isOpen) return
		if (e.key === 'Escape') close()
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
	return {
		destroy: () => {
			if (destroyed) return
			destroyed = true
			document.removeEventListener('keydown', onKeyDown)
			detachMqlListener()
			for (const plugin of pluginList) {
				if (!plugin.onDestroy) continue
				const ctx = pluginContexts.get(plugin.name)
				if (!ctx) continue
				try {
					plugin.onDestroy(ctx)
				} catch (err) {
					ctx.logger.error('onDestroy threw', err)
				}
			}
			pluginStores.clear()
			pluginContexts.clear()
			host.remove()
		},
		open,
		close,
		whenReady: () => readyPromise,
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
			// Non-render-affecting props: just swap refs.
			if ('environment' in next) environment = next.environment
			if ('metadata' in next) metadata = next.metadata
			if ('onSubmit' in next) onSubmit = next.onSubmit
			if ('onError' in next) onError = next.onError
			if ('onOpen' in next) onOpen = next.onOpen
			if ('onClose' in next) onClose = next.onClose
			if (needsRender) render()
		},
	}
}
