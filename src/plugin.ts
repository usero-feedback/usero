// Plugin contract for the Usero widget.
//
// Plugins are opt-in modules that hook into the widget lifecycle to enrich
// feedback submissions or react to widget events. They live in subpath
// exports (e.g. `@usero/sdk/plugins/session-replay`) so consumers who don't
// import them pay zero bundle cost.
//
// Design rules:
//   1. The plugin contract MUST stay framework-free (no React types).
//   2. `onInit` runs fire-and-forget so a slow plugin never blocks the
//      widget from rendering. Plugins that need to be ready before the
//      first interaction are responsible for their own gating internally.
//   3. `onFeedbackSubmit` is awaited and its return value is merged into
//      the outgoing payload. Top-level keys are shallow-merged (later
//      plugins win wholesale); `metadata` is deep-merged one level so two
//      plugins can both contribute keys without clobbering each other.
//      Plugins MUST return quickly (a few hundred ms at most) or risk users
//      abandoning the submit.
//   4. Plugin errors are caught and logged; they never block a submission.

import type { FeedbackSubmission } from './types'

export interface PluginLogger {
	debug: (...args: unknown[]) => void
	info: (...args: unknown[]) => void
	warn: (...args: unknown[]) => void
	error: (...args: unknown[]) => void
}

export interface PluginContext {
	clientId: string
	baseUrl: string
	// Per-plugin scratch store. Plugins can stash state across hook calls
	// without leaking into globals. The key is the plugin's `name`.
	getStore: <T>() => T | undefined
	setStore: <T>(value: T) => void
	logger: PluginLogger
	// Re-resolve the current user via the host's `user` prop or `getUser`
	// callback and run it through the identify dedupe pipeline. Plugins
	// that run independently of widget interaction (e.g. session-replay
	// for replay-only customers who never open the widget) should call
	// this at their own boundaries (session start, chunk flush, etc.)
	// so mid-session login is visible server-side. The fingerprint
	// dedupe in identity.ts makes repeated calls effectively free when
	// nothing changed.
	resolveUser?: () => void
	// ---- Core-owned cross-cutting identity --------------------------------
	// These read the single source of truth in identity.ts so every plugin
	// (replay, user-test, future feedback linkage) sees the SAME ids without
	// importing each other. All optional so older hosts and test doubles that
	// predate this surface still satisfy the contract; plugins must tolerate
	// their absence and fall back gracefully.
	//
	// Per-tab session id (sessionStorage `usero:session-replay:sdk-session-id`).
	// The robust linkage key: the server resolves a SessionReplay by
	// (clientId + sdkSessionId), so any plugin that wants to point at the
	// tab's recording sends this.
	getSdkSessionId?: () => string
	// Per-browser id (localStorage `usero:anonymous-id`) for cross-session
	// stitching.
	getAnonymousId?: () => string
	// Current resolved external user id, or null before identify / after
	// logout.
	getUserId?: () => string | null
	// Wall-clock epoch (ms) when session-replay started, or null if replay
	// is not active. Consumers compute an offset into the recording from
	// this; when null, they degrade (send the sdkSessionId key, omit offset).
	getReplayStartMs?: () => number | null
	// Publish the replay recording start epoch into the core so other
	// plugins can compute offsets. Only the replay plugin should call this.
	publishReplayStartMs?: (epochMs: number) => void
}

export interface UseroPlugin {
	// Stable, unique identifier. Used as the store key and in log prefixes.
	// Convention: lowercase kebab-case (e.g. `session-replay`).
	name: string
	onInit?: (ctx: PluginContext) => void | Promise<void>
	// Returns a partial submission patch that gets merged into the outgoing
	// payload. Top-level keys are shallow-merged (later plugins win on
	// conflict); `metadata` is deep-merged one level so multiple plugins
	// can each attach their own metadata keys without clobbering. Return
	// `undefined` to contribute nothing.
	onFeedbackSubmit?: (
		ctx: PluginContext,
		submission: FeedbackSubmission,
	) => Promise<Partial<FeedbackSubmission> | undefined> | Partial<FeedbackSubmission> | undefined
	onDestroy?: (ctx: PluginContext) => void
}

export function createPluginLogger(name: string): PluginLogger {
	const prefix = `[usero:${name}]`
	return {
		debug: (...args) => {
			if (typeof console !== 'undefined') console.debug(prefix, ...args)
		},
		info: (...args) => {
			if (typeof console !== 'undefined') console.info(prefix, ...args)
		},
		warn: (...args) => {
			if (typeof console !== 'undefined') console.warn(prefix, ...args)
		},
		error: (...args) => {
			if (typeof console !== 'undefined') console.error(prefix, ...args)
		},
	}
}
