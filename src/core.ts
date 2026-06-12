// Framework-free, UI-free core shared by the DOM widget (vanilla.ts) and
// the headless controller (headless.ts). Three responsibilities:
//
//   1. Identity resolution: the user-prop-over-getUser precedence, the
//      reference short-circuit, identify dedupe, and logout rotation.
//   2. Plugin runtime: per-plugin contexts, fire-and-forget onInit with a
//      whenReady() barrier, onFeedbackSubmit patch collection + merge,
//      and onDestroy teardown.
//   3. Submit pipeline: build a FeedbackSubmission from a payload (page
//      context, trimming, metadata merge) and send it through the plugin
//      hooks to the API.
//
// The widget consumes this core and layers its shadow-DOM UI on top;
// `@usero/sdk/headless` exposes it directly so consumers can build their
// own UI. Keep this file free of DOM construction and React imports.

import type { FeedbackApiClient } from './api'
import {
	getCurrentUserId,
	getOrMintAnonymousId,
	getOrMintSdkSessionId,
	getReplayStartMs,
	handleLogout,
	identifyIfChanged,
	publishReplayStartMs,
	reseatSdkSessionId,
	type IdentifyTransport,
} from './identity'
import {
	createPluginLogger,
	type PluginContext,
	type UseroPlugin,
} from './plugin'
import type {
	FeedbackRating,
	FeedbackSubmission,
	ScreenshotData,
	SubmissionResponse,
	UseroUser,
} from './types'

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

// ---- Identity resolution ------------------------------------------------

export interface IdentityHandleOptions {
	// Current user at creation time. `null` means explicitly logged out,
	// `undefined` means "not supplied, defer to getUser".
	user?: UseroUser | null
	// Getter for the current user, re-invoked at resolution boundaries.
	getUser?: () => UseroUser | null | undefined
}

export interface IdentityHandle {
	// Imperative identify. Sets the user prop (which wins over getUser on
	// later resolves) and applies it through the dedupe pipeline. Pass
	// `null` on logout to rotate the anonymousId.
	identify: (user: UseroUser | null) => void
	// Declarative prop update (the widget's update({ user }) path). Same as
	// identify but accepts `undefined` to mean "prop supplied as undefined";
	// the resolved value is still coerced to null.
	setUserProp: (user: UseroUser | null | undefined) => void
	// Hot-swap the getUser callback.
	setGetUser: (fn: (() => UseroUser | null | undefined) | undefined) => void
	// Re-resolve the current user: the last-seen `user` prop wins when set,
	// otherwise getUser is polled. Identify dedupe (reference short-circuit
	// plus fingerprint inside identifyIfChanged) makes repeated calls with
	// an unchanged user free at the network layer.
	resolveUser: () => void
}

export function createIdentityHandle(
	transport: IdentifyTransport,
	initial: IdentityHandleOptions,
): IdentityHandle {
	// Last `user` prop seen. When set (including explicit null for logout),
	// it wins over getUserFn on re-resolve. `undefined` means "no `user`
	// prop ever supplied; defer to getUser".
	let currentUserProp: UseroUser | null | undefined = initial.user
	let getUserFn = initial.getUser

	// Track the last id the SDK has seen so we can detect logout
	// (id -> null) and rotate the anonymousId. Identify dedupe inside
	// identifyIfChanged via a fingerprint guarantees re-runs with the same
	// user never POST. We also short-circuit BEFORE calling it when the
	// trait object is reference-identical, which only catches hosts that
	// memoise their traits object; the common React case of a fresh
	// `{ ... }` literal per render falls through to the fingerprint
	// dedupe, which is cheap (one stringify, no network) so this is fine.
	let lastUserId: string | null = null
	let lastTraitsRef: UseroUser['traits'] | undefined
	let lastEmail: string | undefined
	let lastDisplayName: string | undefined

	function applyResolvedUser(user: UseroUser | null | undefined): void {
		const next = user ?? null
		if (next) {
			const unchanged =
				next.id === lastUserId &&
				next.traits === lastTraitsRef &&
				next.email === lastEmail &&
				next.displayName === lastDisplayName
			if (unchanged) return
			void identifyIfChanged(transport, next)
			lastUserId = next.id
			lastTraitsRef = next.traits
			lastEmail = next.email
			lastDisplayName = next.displayName
		} else if (lastUserId !== null) {
			// Logout transition. Rotate anonymousId so the next anonymous
			// trail doesn't get auto-merged into the previous person on
			// the next identify().
			handleLogout()
			lastUserId = null
			lastTraitsRef = undefined
			lastEmail = undefined
			lastDisplayName = undefined
		}
	}

	function resolveAndApplyGetUser(): void {
		if (!getUserFn) return
		try {
			applyResolvedUser(getUserFn() ?? null)
		} catch {
			// getUser threw; leave the resolved user as it was. Do not
			// rotate, do not fire identify. A throwing getter likely means
			// the host app's auth context is mid-render.
		}
	}

	// Initial resolve: prefer the imperative `user` prop, fall back to
	// the `getUser` callback. Both are safe to call here; we just don't
	// fire identify when both are absent.
	if (initial.user !== undefined) {
		applyResolvedUser(initial.user)
	} else if (getUserFn) {
		resolveAndApplyGetUser()
	}

	return {
		identify: user => {
			currentUserProp = user
			applyResolvedUser(user)
		},
		setUserProp: user => {
			currentUserProp = user
			applyResolvedUser(user)
		},
		setGetUser: fn => {
			getUserFn = fn
		},
		resolveUser: () => {
			if (currentUserProp !== undefined) {
				applyResolvedUser(currentUserProp)
			} else {
				resolveAndApplyGetUser()
			}
		},
	}
}

// ---- Plugin runtime -----------------------------------------------------

export interface PluginRuntimeOptions {
	clientId: string
	apiUrl: string
	plugins: ReadonlyArray<UseroPlugin>
	// Re-resolves the host's current user (see IdentityHandle.resolveUser).
	// Exposed to plugins via PluginContext.resolveUser so e.g. the replay
	// plugin can re-poll user state at chunk boundaries.
	resolveUser: () => void
}

export interface PluginRuntime {
	// Resolves once every plugin's `onInit` promise has settled (fulfilled
	// OR rejected). Synchronous onInits resolve on the next microtask. If
	// no plugins are registered, resolves immediately.
	whenReady: () => Promise<void>
	// Run every plugin's onFeedbackSubmit hook in parallel and merge the
	// returned partial payloads into the submission (see mergePluginPatches
	// for the merge policy). A plugin that throws or rejects is logged and
	// skipped, never blocking the submit.
	enrichSubmission: (submission: FeedbackSubmission) => Promise<FeedbackSubmission>
	// Fire every plugin's onDestroy (errors caught and logged) and clear
	// plugin stores. Idempotent.
	destroy: () => void
}

export function createPluginRuntime(options: PluginRuntimeOptions): PluginRuntime {
	const { clientId, apiUrl, plugins, resolveUser } = options
	// Plugin registry. Each plugin gets its own context with a private store.
	// `onInit` is fired non-blocking so a slow plugin can't delay the host.
	// Errors are caught so a misbehaving plugin can't tear the host down or
	// block submissions.
	const pluginStores = new Map<string, unknown>()
	const pluginContexts = new Map<string, PluginContext>()
	let destroyed = false
	const initPromises: Promise<void>[] = []
	for (const plugin of plugins) {
		const ctx: PluginContext = {
			clientId,
			baseUrl: apiUrl,
			logger: createPluginLogger(plugin.name),
			getStore: <T,>() => pluginStores.get(plugin.name) as T | undefined,
			setStore: <T,>(value: T) => {
				pluginStores.set(plugin.name, value)
			},
			// Expose the same user-resolution path the host uses, so plugins
			// (e.g. session-replay for replay-only installs that never open the
			// widget) can re-poll user state at their own boundaries.
			resolveUser: () => {
				if (destroyed) return
				resolveUser()
			},
			// Core-owned cross-cutting identity. Every plugin reads the same
			// source of truth in identity.ts, so user-test and session-replay
			// agree on the per-tab sdkSessionId without importing each other.
			getSdkSessionId: () => getOrMintSdkSessionId(),
			reseatSdkSessionId: (id: string) => reseatSdkSessionId(id),
			getAnonymousId: () => getOrMintAnonymousId(),
			getUserId: () => getCurrentUserId(),
			getReplayStartMs: () => getReplayStartMs(),
			publishReplayStartMs: (epochMs: number) => publishReplayStartMs(epochMs),
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
		initPromises.length === 0
			? Promise.resolve()
			: Promise.all(initPromises).then(() => {})

	return {
		whenReady: () => readyPromise,
		enrichSubmission: async submission => {
			if (plugins.length === 0) return submission
			const patchPromises = plugins.map(async plugin => {
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
			return mergePluginPatches(submission, patches)
		},
		destroy: () => {
			if (destroyed) return
			destroyed = true
			for (const plugin of plugins) {
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
		},
	}
}

// ---- Submit pipeline ----------------------------------------------------

// What a custom UI hands to `submit()`. Page context (pageUrl, pageTitle,
// referrer) is captured automatically; identity flows through identify();
// replay linkage is attached by the plugin pipeline.
export interface SubmitFeedbackPayload {
	// 1 (needs work) to 4 (amazing). A submission needs a rating or a
	// non-empty comment.
	rating?: FeedbackRating
	// Free-text comment, max 1000 chars. Trimmed; an all-whitespace comment
	// counts as absent.
	comment?: string
	// Email the user chose to share. Trimmed; empty string counts as absent.
	userEmail?: string
	// Screenshots previously uploaded via uploadScreenshot().
	screenshots?: ScreenshotData[]
	// Per-submission metadata. Deep-merged one level over the instance-wide
	// metadata (submission keys win on conflict).
	metadata?: Record<string, unknown>
}

export interface BuildSubmissionOptions {
	clientId: string
	environment?: string
	// Instance-wide metadata attached to every submission.
	metadata?: Record<string, unknown>
	payload: SubmitFeedbackPayload
}

export function buildFeedbackSubmission(
	options: BuildSubmissionOptions,
): FeedbackSubmission {
	const { clientId, environment, metadata, payload } = options
	const pageUrl = typeof window !== 'undefined' ? window.location.href : ''
	const pageTitle =
		typeof document !== 'undefined'
			? document.title || 'Untitled Page'
			: 'Untitled Page'
	const referrer =
		typeof document !== 'undefined' && document.referrer
			? document.referrer
			: undefined

	const comment = payload.comment?.trim() || undefined
	const userEmail = payload.userEmail?.trim() || undefined

	const submission: FeedbackSubmission = {
		clientId,
		rating: payload.rating,
		comment,
		userEmail,
		pageUrl,
		pageTitle,
		referrer,
		environment,
	}
	if (payload.screenshots && payload.screenshots.length > 0) {
		submission.screenshots = payload.screenshots
	}
	if (metadata !== undefined || payload.metadata !== undefined) {
		submission.metadata = {
			...(metadata ?? {}),
			...(payload.metadata ?? {}),
		}
	}
	return submission
}

// Run the plugin onFeedbackSubmit hooks over a validated submission and
// POST the enriched result. Never throws: FeedbackApiClient.submitFeedback
// converts transport failures into `{ success: false, error }`, and plugin
// errors are caught per-plugin inside enrichSubmission.
export async function submitWithPlugins(
	apiClient: FeedbackApiClient,
	runtime: PluginRuntime,
	submission: FeedbackSubmission,
): Promise<SubmissionResponse> {
	const enriched = await runtime.enrichSubmission(submission)
	return apiClient.submitFeedback(enriched)
}
