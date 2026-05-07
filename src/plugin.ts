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
//   3. `onFeedbackSubmit` is awaited and its return value is shallow-merged
//      into the outgoing payload. Plugins MUST return quickly (a few hundred
//      ms at most) or risk users abandoning the submit.
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
}

export interface UseroPlugin {
	// Stable, unique identifier. Used as the store key and in log prefixes.
	// Convention: lowercase kebab-case (e.g. `session-replay`).
	name: string
	onInit?: (ctx: PluginContext) => void | Promise<void>
	// Returns a partial submission patch that gets shallow-merged into the
	// outgoing payload. Return `undefined` to contribute nothing.
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
