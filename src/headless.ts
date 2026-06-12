// Headless feedback controller: the widget's submission, identity, and
// plugin pipeline with no UI. Build your own form, modal, or inline panel
// and wire it to this controller.
//
//   import { createUseroFeedback } from '@usero/sdk/headless'
//
//   const usero = createUseroFeedback({ clientId: 'YOUR_CLIENT_ID' })
//   const result = await usero.submit({ rating: 4, comment: 'Love it' })
//
// Deliberately NO open/close/isOpen: UI state belongs to the consumer.
// React consumers: use `useUseroFeedback` from `@usero/sdk/headless/react`.

import { FeedbackApiClient } from './api'
import {
	buildFeedbackSubmission,
	createIdentityHandle,
	createPluginRuntime,
	submitWithPlugins,
	type SubmitFeedbackPayload,
} from './core'
import { createPluginLogger, type UseroPlugin } from './plugin'
import {
	DEFAULT_API_URL,
	type ScreenshotData,
	type SubmissionResponse,
	type UseroUser,
} from './types'
import { validateFeedbackSubmission } from './validation'

// Everything a consumer needs to fully type a custom integration.
export { mergePluginPatches, type SubmitFeedbackPayload } from './core'
export { validateFeedbackSubmission, type ValidationResult } from './validation'
export type { PluginContext, PluginLogger, UseroPlugin } from './plugin'
export type {
	FeedbackRating,
	FeedbackSubmission,
	ScreenshotData,
	SubmissionResponse,
	UseroUser,
	UseroUserTraits,
	UseroUserTraitValue,
} from './types'

export interface UseroFeedbackOptions {
	// Your Usero client id.
	clientId: string
	// API origin. Override for self-hosted or local dev. Defaults to
	// https://usero.io (same convention as the standalone replay options).
	apiUrl?: string
	// Environment tag attached to every submission (e.g. 'staging').
	environment?: string
	// Instance-wide metadata attached to every submission. Per-submission
	// metadata passed to submit() is deep-merged over it (one level).
	metadata?: Record<string, unknown>
	// Plugins run exactly as they do under the widget: onInit at creation,
	// onFeedbackSubmit on every submit (this is what lets sessionReplay()
	// auto-attach sessionReplayId/replayOffsetMs to your submissions), and
	// onDestroy on destroy().
	plugins?: ReadonlyArray<UseroPlugin>
	// Declarative identity. Pass the current user (or null for an
	// explicitly logged-out visitor), or a getUser callback that is
	// re-resolved at submit time and plugin boundaries. Pass at most one.
	user?: UseroUser | null
	getUser?: () => UseroUser | null | undefined
}

export interface UseroFeedbackController {
	// Validate, run the plugin pipeline, and POST the feedback. Resolves
	// with `{ success: false, error }` instead of throwing, for both
	// validation failures and transport errors, so a custom UI can render
	// the message directly. A submission needs a rating or a non-empty
	// comment; page context (pageUrl, pageTitle, referrer) is captured
	// automatically.
	submit: (payload?: SubmitFeedbackPayload) => Promise<SubmissionResponse>
	// Upload one image (max 10MB server-side) and get back a ScreenshotData
	// to include in a later submit({ screenshots: [...] }). Rejects with an
	// Error on failure, since an upload UI typically wants try/catch per
	// file rather than a result union.
	uploadScreenshot: (file: File) => Promise<ScreenshotData>
	// Imperative identify. Pass null on logout (rotates the anonymousId so
	// the next anonymous trail doesn't merge into the previous person).
	// Deduped: repeat calls with the same user never hit the network.
	identify: (user: UseroUser | null) => void
	// Resolves once every plugin's onInit has settled (fulfilled OR
	// rejected). Resolves immediately when no plugins are registered.
	whenReady: () => Promise<void>
	// Tell recording plugins (session replay) that a shadow root hosting
	// your custom UI was just mounted, so the recorder re-snapshots and
	// captures it. Only needed if you render your feedback UI inside a
	// ShadowRoot; light-DOM UIs are recorded automatically.
	notifyShadowMount: (root: ShadowRoot) => void
	// Run every plugin's onDestroy and inert this controller. Further
	// submits resolve with `{ success: false }`.
	destroy: () => void
}

// Inert controller for SSR and invalid-config paths. Mirrors the widget's
// no-op handle: the SDK runs in customer production code, so configuration
// mistakes log and degrade instead of throwing.
function createInertController(reason: string): UseroFeedbackController {
	return {
		submit: () => Promise.resolve({ success: false, error: reason }),
		uploadScreenshot: () => Promise.reject(new Error(reason)),
		identify: () => {},
		whenReady: () => Promise.resolve(),
		notifyShadowMount: () => {},
		destroy: () => {},
	}
}

export function createUseroFeedback(
	options: UseroFeedbackOptions,
): UseroFeedbackController {
	// SSR guard: identity storage, plugins, and page-context capture all
	// need a browser. The React hook only creates controllers inside an
	// effect, so this path is for direct createUseroFeedback() calls in
	// code that may also run server-side.
	if (typeof window === 'undefined') {
		return createInertController('Usero feedback requires a browser environment')
	}

	const logger = createPluginLogger('headless')
	const { clientId } = options
	if (!clientId || clientId.length < 3) {
		logger.error('createUseroFeedback needs a clientId')
		return createInertController('Invalid Usero clientId')
	}

	const apiUrl = options.apiUrl ?? DEFAULT_API_URL
	const apiClient = new FeedbackApiClient(apiUrl)
	const identity = createIdentityHandle(
		{ apiUrl, clientId },
		{ user: options.user, getUser: options.getUser },
	)
	const runtime = createPluginRuntime({
		clientId,
		apiUrl,
		plugins: options.plugins ?? [],
		resolveUser: () => identity.resolveUser(),
	})

	let destroyed = false
	return {
		submit: async (payload = {}) => {
			if (destroyed) {
				return { success: false, error: 'This Usero instance was destroyed' }
			}
			// Submit is the headless interaction boundary (the widget uses
			// panel-open). Re-resolve the user here so a login that happened
			// since creation is identified before the feedback row lands.
			// Dedupe makes this free when nothing changed.
			identity.resolveUser()
			const submission = buildFeedbackSubmission({
				clientId,
				environment: options.environment,
				metadata: options.metadata,
				payload,
			})
			const validation = validateFeedbackSubmission(submission)
			if (!validation.isValid) {
				return { success: false, error: validation.errors.join(', ') }
			}
			return submitWithPlugins(apiClient, runtime, submission)
		},
		uploadScreenshot: file => {
			if (destroyed) {
				return Promise.reject(new Error('This Usero instance was destroyed'))
			}
			return apiClient.uploadScreenshot(file, clientId)
		},
		identify: user => {
			if (destroyed) return
			identity.identify(user)
		},
		whenReady: () => runtime.whenReady(),
		notifyShadowMount: root => {
			if (destroyed) return
			// Same signal the widget fires for its own shadow root. The
			// session-replay plugin listens on window and re-takes a full
			// snapshot so rrweb walks into (and starts observing) the newly
			// attached shadow tree.
			try {
				window.dispatchEvent(
					new CustomEvent('usero:shadow-update', {
						detail: { host: root.host, root, reason: 'mount' },
					}),
				)
			} catch {
				// Older browsers without CustomEvent / dispatchEvent: best-effort.
			}
		},
		destroy: () => {
			if (destroyed) return
			destroyed = true
			runtime.destroy()
		},
	}
}
