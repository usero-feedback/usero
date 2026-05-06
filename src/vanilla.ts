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
export type {
	FeedbackData,
	FeedbackRating,
	FeedbackSubmission,
	FeedbackWidgetProps,
	ScreenshotData,
	WidgetPosition,
	WidgetTheme,
} from './types'

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
		}
	}

	// Mutable view of every prop that can be hot-swapped via update(). Read
	// these at render time, never destructure into local const above the
	// render closures or you'll capture stale values.
	let position: WidgetPosition = props.position ?? 'right'
	let theme: WidgetTheme = mergeTheme(props.theme)
	let title: string = props.title ?? 'Share Feedback'
	let placeholder: string = props.placeholder ?? 'Tell us what you think... (optional)'
	let showEmailOption: boolean = props.showEmailOption ?? true
	let environment: string | undefined = props.environment
	let metadata: Record<string, unknown> | undefined = props.metadata
	let onSubmit: FeedbackWidgetProps['onSubmit'] = props.onSubmit
	let onError: FeedbackWidgetProps['onError'] = props.onError
	let onOpen: FeedbackWidgetProps['onOpen'] = props.onOpen
	let onClose: FeedbackWidgetProps['onClose'] = props.onClose

	const apiClient = new FeedbackApiClient(baseUrl)

	// State
	let isOpen = false
	let selectedRating: FeedbackRating | undefined = undefined
	let comment = ''
	let shareEmail = false
	let userEmail = readStoredEmail()
	let isSubmitting = false
	let submitMessage: { type: 'success' | 'error'; text: string } | null = null

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
		apiClient.ping()
		onOpen?.()
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
		if (metadata !== undefined) submission.metadata = metadata

		const validation = validateFeedbackSubmission(submission)
		if (!validation.isValid) {
			isSubmitting = false
			setSubmitMessage({ type: 'error', text: validation.errors.join(', ') })
			return
		}

		try {
			const response = await apiClient.submitFeedback(submission)
			if (response.success) {
				if (shareEmail && userEmail) writeStoredEmail(userEmail)
				onSubmit?.(feedbackData)
				selectedRating = undefined
				comment = ''
				shareEmail = false
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
				return `
					<div class="${cls}" style="background:${bg}">
						<button type="button" class="fb-eb" data-rating="${r}" role="radio" aria-checked="${sel}" aria-label="${r}: ${RATING_LABELS[r]}">
							<div class="fb-ei"><span role="img" aria-label="${RATING_LABELS[r]}">${EMOJI_MAP[r]}</span></div>
							<div class="fb-el">${RATING_LABELS[r]}</div>
						</button>
					</div>
				`
			})
			.join('')

		const messageHtml = submitMessage
			? `<div class="fb-msg fb-msg--header ${submitMessage.type === 'success' ? 'fb-msg--ok' : 'fb-msg--err'}">${submitMessage.type === 'success' ? '✓' : '⚠'} ${escapeHtml(submitMessage.text)}</div>`
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
					<div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
						<div style="font-size:12px;color:${lowChars ? '#dc2626' : theme.text};opacity:${lowChars ? 1 : 0.6};margin-left:auto;">
							${remaining} chars remaining
						</div>
					</div>
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
					const counter = panelEl.querySelector<HTMLDivElement>(
						'.fb-cnt form > div > div',
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

	// Initial paint
	render()

	let destroyed = false
	return {
		destroy: () => {
			if (destroyed) return
			destroyed = true
			document.removeEventListener('keydown', onKeyDown)
			host.remove()
		},
		open,
		close,
		update: next => {
			if (destroyed) return
			let needsRender = false
			if (next.position !== undefined && next.position !== position) {
				position = next.position
				needsRender = true
			}
			if (next.theme !== undefined) {
				theme = mergeTheme(next.theme)
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
