// Session replay plugin for the Usero widget.
//
// Lazy-loads rrweb the first time it's actually needed and keeps a rolling
// in-memory buffer of the last `bufferSeconds` of events. On feedback
// submit, the buffer is gzipped via the native CompressionStream API and
// attached as `replayEvents` (base64 string) on the outgoing payload.
//
// Bundle hygiene is the whole point of this plugin existing as its own
// subpath export. Importing this module pulls in the small wrapper below;
// the heavy rrweb dependency only loads at runtime via dynamic `import()`.
//
// Privacy defaults err on the side of safety: all <input>/<textarea> values
// are masked, anything tagged `data-usero-mask` is masked too, and inline
// styles are inlined so we never leak external stylesheet URLs.

import type { UseroPlugin, PluginContext } from '../plugin'
import type { FeedbackSubmission } from '../types'

// We deliberately avoid importing rrweb's types at the top level — that
// would force consumers to install rrweb as a peer dep and would also pull
// the type declarations into our published .d.ts files. Plugin internals
// use a minimal local shape and rely on rrweb's runtime API only.

// rrweb event sample-rate map. Keys match rrweb's `sampling` option. See
// https://github.com/rrweb-io/rrweb/blob/master/guide.md#options for the
// full list. We expose the two that matter most (mousemove, scroll).
export interface ReplaySampling {
	// Capture a mousemove event at most every N ms (default 50).
	mousemove?: number
	// Capture a scroll event at most every N ms (default 100).
	scroll?: number
	// Capture a media-interaction event at most every N ms.
	media?: number
	// Capture an input event at most every N ms, or 'last' to keep only the
	// final input value per element.
	input?: number | 'last'
}

export interface SessionReplayOptions {
	// Length of the rolling buffer in seconds. Older events are evicted as
	// new ones arrive. Default 30.
	bufferSeconds?: number
	// Wait this many ms after page load before loading rrweb and starting
	// to record. If the user navigates away before this elapses, rrweb is
	// never loaded. Default 0 (start immediately).
	startAfterMs?: number
	// Probability (0..1) that this session records at all. Decided once at
	// init via Math.random(). Sessions that lose the dice roll never load
	// rrweb. Default 1 (always record).
	sampleRate?: number
	// rrweb sampling rates per event type. See ReplaySampling above.
	sampling?: ReplaySampling
	// Mask all <input>/<textarea> values in the recording. Default true.
	maskAllInputs?: boolean
	// CSS selector for nodes whose text content should be masked. Default
	// `[data-usero-mask]`. Pass an empty string to disable selector masking.
	maskTextSelector?: string
	// Inline external stylesheets into the recording so the replay viewer
	// renders correctly without network access. Default true.
	inlineStylesheet?: boolean
	// Block (entirely skip) DOM subtrees matching this selector. Default
	// `[data-usero-block]`.
	blockSelector?: string
}

interface RrwebEvent {
	type: number
	data: unknown
	timestamp: number
}

interface RrwebRecordOptions {
	emit: (event: RrwebEvent) => void
	maskAllInputs?: boolean
	maskTextSelector?: string
	inlineStylesheet?: boolean
	blockSelector?: string
	sampling?: ReplaySampling
}

type RrwebRecord = (opts: RrwebRecordOptions) => () => void

interface ReplayStore {
	events: RrwebEvent[]
	stopRecording: (() => void) | null
	startTimer: ReturnType<typeof setTimeout> | null
	pageHideHandler: (() => void) | null
	loadInProgress: boolean
	cancelled: boolean
	options: Required<Omit<SessionReplayOptions, 'sampling'>> & { sampling: ReplaySampling }
}

const DEFAULT_OPTIONS: Required<Omit<SessionReplayOptions, 'sampling'>> & {
	sampling: ReplaySampling
} = {
	bufferSeconds: 30,
	startAfterMs: 0,
	sampleRate: 1,
	sampling: { mousemove: 50, scroll: 100 },
	maskAllInputs: true,
	maskTextSelector: '[data-usero-mask]',
	inlineStylesheet: true,
	blockSelector: '[data-usero-block]',
}

function evictOldEvents(events: RrwebEvent[], bufferSeconds: number, now: number): void {
	if (events.length === 0) return
	const cutoff = now - bufferSeconds * 1000
	// Events are appended in chronological order; find the first event
	// inside the window with a linear scan from the head and splice once.
	let dropCount = 0
	for (const e of events) {
		if (e.timestamp >= cutoff) break
		dropCount++
	}
	if (dropCount > 0) events.splice(0, dropCount)
}

// Convert a Uint8Array to base64 without bringing in a dependency. Chunked
// to avoid blowing the call stack on large buffers.
function uint8ToBase64(bytes: Uint8Array): string {
	let binary = ''
	const chunkSize = 0x8000
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize)
		binary += String.fromCharCode.apply(null, Array.from(chunk))
	}
	return typeof btoa === 'function' ? btoa(binary) : ''
}

async function gzipString(input: string): Promise<string> {
	if (typeof CompressionStream === 'undefined') {
		// Browsers without CompressionStream (very old) fall back to raw
		// base64 of the JSON. The server can detect this by sniffing the
		// gzip magic bytes; cheaper than shipping a JS gzip lib.
		const bytes = new TextEncoder().encode(input)
		return uint8ToBase64(bytes)
	}
	const stream = new Blob([input]).stream().pipeThrough(new CompressionStream('gzip'))
	const compressed = await new Response(stream).arrayBuffer()
	return uint8ToBase64(new Uint8Array(compressed))
}

async function loadRrwebRecord(): Promise<RrwebRecord | null> {
	try {
		const mod: unknown = await import(/* webpackChunkName: "rrweb" */ 'rrweb')
		if (
			mod &&
			typeof mod === 'object' &&
			'record' in mod &&
			typeof (mod as { record: unknown }).record === 'function'
		) {
			return (mod as { record: RrwebRecord }).record
		}
		return null
	} catch {
		return null
	}
}

function startRecording(store: ReplayStore, ctx: PluginContext): void {
	if (store.cancelled || store.stopRecording || store.loadInProgress) return
	store.loadInProgress = true
	void loadRrwebRecord().then(record => {
		store.loadInProgress = false
		// Window may have been torn down between the import resolving and
		// us getting here. Don't start a recording into a destroyed plugin.
		if (store.cancelled || !record) {
			if (!record) ctx.logger.warn('rrweb failed to load, replay disabled')
			return
		}
		try {
			const stop = record({
				emit: event => {
					store.events.push(event)
					evictOldEvents(store.events, store.options.bufferSeconds, event.timestamp)
				},
				maskAllInputs: store.options.maskAllInputs,
				maskTextSelector: store.options.maskTextSelector || undefined,
				inlineStylesheet: store.options.inlineStylesheet,
				blockSelector: store.options.blockSelector,
				sampling: store.options.sampling,
			})
			store.stopRecording = stop
		} catch (err) {
			ctx.logger.error('rrweb record() threw', err)
		}
	})
}

export function sessionReplay(options: SessionReplayOptions = {}): UseroPlugin {
	const merged = {
		...DEFAULT_OPTIONS,
		...options,
		sampling: { ...DEFAULT_OPTIONS.sampling, ...(options.sampling ?? {}) },
	}

	return {
		name: 'session-replay',
		onInit(ctx) {
			// Lose the dice roll? Don't even prepare to load rrweb.
			if (merged.sampleRate < 1 && Math.random() >= merged.sampleRate) {
				ctx.logger.debug('skipped by sampleRate')
				return
			}
			if (typeof window === 'undefined') return

			const store: ReplayStore = {
				events: [],
				stopRecording: null,
				startTimer: null,
				pageHideHandler: null,
				loadInProgress: false,
				cancelled: false,
				options: merged,
			}
			ctx.setStore(store)

			const begin = (): void => {
				if (store.startTimer) {
					clearTimeout(store.startTimer)
					store.startTimer = null
				}
				if (store.pageHideHandler) {
					window.removeEventListener('pagehide', store.pageHideHandler)
					window.removeEventListener('beforeunload', store.pageHideHandler)
					store.pageHideHandler = null
				}
				startRecording(store, ctx)
			}

			if (merged.startAfterMs > 0) {
				// Engagement gate: only load rrweb if the user is still on the
				// page after `startAfterMs`. If they navigate away first we
				// cancel and never pull the heavy module.
				const cancelOnExit = (): void => {
					store.cancelled = true
					if (store.startTimer) {
						clearTimeout(store.startTimer)
						store.startTimer = null
					}
					if (store.pageHideHandler) {
						window.removeEventListener('pagehide', store.pageHideHandler)
						window.removeEventListener('beforeunload', store.pageHideHandler)
						store.pageHideHandler = null
					}
				}
				store.pageHideHandler = cancelOnExit
				window.addEventListener('pagehide', cancelOnExit, { once: true })
				window.addEventListener('beforeunload', cancelOnExit, { once: true })
				store.startTimer = setTimeout(begin, merged.startAfterMs)
			} else {
				begin()
			}
		},
		async onFeedbackSubmit(ctx): Promise<Partial<FeedbackSubmission> | undefined> {
			const store = ctx.getStore<ReplayStore>()
			if (!store || store.cancelled || store.events.length === 0) return undefined
			// Snapshot the current buffer so concurrent emits can't mutate
			// what we're serializing.
			const snapshot = store.events.slice()
			try {
				const json = JSON.stringify(snapshot)
				const replayEvents = await gzipString(json)
				return { replayEvents }
			} catch (err) {
				ctx.logger.error('failed to encode replay buffer', err)
				return undefined
			}
		},
		onDestroy(ctx) {
			const store = ctx.getStore<ReplayStore>()
			if (!store) return
			store.cancelled = true
			if (store.startTimer) clearTimeout(store.startTimer)
			if (store.pageHideHandler) {
				window.removeEventListener('pagehide', store.pageHideHandler)
				window.removeEventListener('beforeunload', store.pageHideHandler)
			}
			if (store.stopRecording) {
				try {
					store.stopRecording()
				} catch (err) {
					ctx.logger.warn('rrweb stop threw', err)
				}
			}
			store.events.length = 0
		},
	}
}

// Internal helper exports for testing only. Not part of the public API.
export const __test__ = { evictOldEvents, gzipString, uint8ToBase64 }
