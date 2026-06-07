// User-testing-mode plugin for the Usero widget.
//
// Activates ONLY when the host page URL carries `?usero_test=<slug>`. When
// active, it:
//   1. Creates a UserTestSession on the SaaS side via
//      POST /api/user-test-sessions
//   2. Starts a MediaRecorder on the user's microphone (Opus in WebM) and
//      ships chunks every `chunkSeconds` to
//      PUT /api/user-test-sessions/:id/chunk?index=N
//   3. Renders a small floating "recording" indicator with a Finish button
//      bottom-center so the tester can stop on their own.
//   4. On Finish, flushes any buffered chunks and calls
//      POST /api/user-test-sessions/:id/finalise.
//
// Resume across hard navigations: `pagehide` / `visibilitychange -> hidden` now
// PAUSE rather than finalise. The recorder stops and queued chunks drain on
// `keepalive`, but the session stays open server-side. Resume state
// ({ slug, sessionId, nextChunkIndex, startedAt }) is persisted per-origin in
// localStorage (`usero:user-test:active-session`). On init, a non-stale entry
// (< 2h old) makes the plugin re-adopt that session and continue recording from
// nextChunkIndex, even when the URL no longer carries `?usero_test`/`uts` (e.g.
// after an OAuth round-trip). The mic permission is already granted on the same
// origin, so no second prompt. The rrweb DOM recorder resumes on its own: the
// session-replay plugin re-inits on the fresh document, reuses the same
// sdkSessionId from sessionStorage, and the server stitches the replay across
// the gap. Finalisation comes only from an explicit Finish or the server-side
// stale-session sweep (~10 min of no chunks); see recoverStuckUserTestSessions
// in the feedback repo.
//
// Mic-permission denied is non-fatal: the session is still created (the
// session-replay plugin keeps recording in parallel) and the indicator
// shows a "no audio" hint. The SaaS side detects audio presence from the
// first chunk; if no chunks land, hasAudio stays false there too.
//
// Bundle hygiene: this module is a subpath export and does NOT depend on
// rrweb or any other heavy dep — just the native MediaRecorder API. The
// floating UI is shadow-DOM scoped so host page CSS can't leak in.
//
// Privacy: only the microphone is recorded. We never read DOM text, never
// touch the camera, and never persist audio in the browser past the
// IndexedDB fallback (cleared on successful upload).
//
// This file is the thin entry that composes the modules under
// `./user-test/`: shared (types/constants/icons), session (resume state +
// network), recorder (capture lifecycle + silence guard), ui (indicator +
// screens), and lifecycle (pause/finish orchestration).

import type { UseroPlugin } from '../plugin'
import { DEFAULT_API_URL } from '../types'
import { finishFlow, pauseFlow } from './user-test/lifecycle'
import {
	classifyChunkResponse,
	handleSessionClosed,
	isMediaRecorderSupported,
	isStreamSilent,
	pickMimeType,
	rmsDbFromSamples,
	startRecording,
	stopRecording,
	toggleMute,
} from './user-test/recorder'
import {
	adoptSession,
	clearActiveSession,
	createSession,
	getAdoptSessionId,
	getTestSlug,
	parseActiveSession,
	persistActiveSession,
	postNoteWithRetry,
	readActiveSession,
	readTesterName,
} from './user-test/session'
import {
	ACTIVE_SESSION_MAX_AGE_MS,
	ACTIVE_SESSION_STORAGE_KEY,
	DEFAULT_OPTIONS,
	type InFlightNote,
	type RecorderStore,
	RESUME_MAX_IDLE_MS,
	SILENCE_FLOOR_DB,
	SILENCE_RMS_DB_THRESHOLD,
	type UserTestOptions,
	type UserTestTask,
} from './user-test/shared'
import {
	buildIndicator,
	closeNotePopover,
	installTasksToggle,
	micChipState,
	openNotePopover,
	readTasksPanelOpen,
	renderIndicatorState,
	renderNotesCount,
	renderTasksPanel,
	showMuteToast,
	showResumedToast,
	showSessionEndedScreen,
	writeTasksPanelOpen,
} from './user-test/ui'

export type { UserTestOptions } from './user-test/shared'
// Pure, side-effect-free silence helpers. Re-exported at the package's public
// surface (they were top-level exports of this module before the split).
export { isStreamSilent, rmsDbFromSamples } from './user-test/recorder'

export function userTest(options: UserTestOptions = {}): UseroPlugin {
	const merged: Required<UserTestOptions> = {
		queryParam: options.queryParam ?? DEFAULT_OPTIONS.queryParam,
		chunkSeconds: options.chunkSeconds ?? DEFAULT_OPTIONS.chunkSeconds,
		apiUrl: options.apiUrl ?? DEFAULT_OPTIONS.apiUrl,
		testerName: options.testerName ?? DEFAULT_OPTIONS.testerName,
		hideIndicator: options.hideIndicator ?? DEFAULT_OPTIONS.hideIndicator,
	}

	return {
		name: 'user-test',
		onInit(ctx) {
			if (typeof window === 'undefined' || typeof document === 'undefined') return
			const urlSlug = getTestSlug(merged.queryParam)
			// Resume source of truth: a non-stale persisted session for THIS origin
			// means a test is in progress, even when the URL no longer carries
			// `?usero_test`/`uts` (the common case after an OAuth round-trip strips
			// the params). We resume it unless the URL explicitly names a DIFFERENT
			// slug (a fresh test on the same origin supersedes a stale-but-in-window
			// leftover, so we drop the old one rather than resuming the wrong test).
			const resumeState = readActiveSession()
			const resumable = resumeState && (!urlSlug || urlSlug === resumeState.slug) ? resumeState : null
			if (resumeState && !resumable) {
				// URL names a different test than the persisted one: the old session
				// is abandoned in favour of the new test. Clear it so we don't leave
				// a dangling resume pointer (the server stale sweep finalises it).
				clearActiveSession()
			}

			const slug = resumable?.slug ?? urlSlug
			if (!slug) return
			const isResume = resumable !== null

			// CRITICAL replay-link fix: re-seat the per-tab sdkSessionId from the
			// durable resume state SYNCHRONOUSLY, before anything else. A cross-origin
			// hard nav wiped sessionStorage, so without this the resumed session-replay
			// plugin would mint a NEW sdkSessionId; the post-nav replay row would then
			// no longer share an id with this audio session, the finalise
			// (clientId, sdkSessionId) join would miss, and the dashboard would hide a
			// perfectly-recorded replay. reseatSdkSessionId writes sessionStorage AND
			// the core cache, so it corrects the id whether session-replay's onInit
			// runs after this (reads the re-seated value) or already ran (cache fixed,
			// and its own finalise reads through the cache). No-ops on a bad/absent id.
			if (isResume && resumable?.sdkSessionId && ctx.reseatSdkSessionId) {
				ctx.reseatSdkSessionId(resumable.sdkSessionId)
			}

			const apiUrl = merged.apiUrl || ctx.baseUrl || DEFAULT_API_URL
			const store: RecorderStore = {
				cancelled: false,
				slug,
				sessionId: null,
				clientId: null,
				recorder: null,
				stream: null,
				// On resume, continue the chunk index so we never overwrite a chunk
				// already shipped in the pre-navigation leg.
				chunkIndex: resumable?.nextChunkIndex ?? 0,
				uploadQueue: Promise.resolve(),
				pendingUploads: 0,
				// On resume, keep the ORIGINAL session start so duration + staleness
				// stay anchored to when the test actually began, not the return moment.
				startedAt: resumable?.startedAt ?? Date.now(),
				indicator: null,
				indicatorRoot: null,
				indicatorState: 'recording',
				pageHideHandler: null,
				visibilityHandler: null,
				options: { ...merged, apiUrl },
				tasks: [],
				tasksPanelOpen: readTasksPanelOpen(),
				outsidePointerHandler: null,
				keydownHandler: null,
				hasMicPermission: false,
				micAcquiring: true,
				micFailReason: null,
				muted: false,
				mutedSinceMs: null,
				mutedSegments: [],
				micSilent: false,
				silenceMonitor: null,
				muteToastShown: false,
				muteToastTimers: [],
				resumeToastTimers: [],
				notes: [],
				notesPopoverOpen: false,
				notePopoverAtMs: null,
				endNote: '',
				finishFlowRan: false,
				sessionClosed: false,
				onSessionClosed: null,
				paused: false,
				resumed: isResume,
				sdkSessionId: null,
				replayOffsetAtStartMs: null,
			}
			ctx.setStore(store)

			// Terminal close handler invoked by the chunk-upload path when the
			// server reports the session is already closed (409 + closeResume) while
			// recording, e.g. finalise was triggered elsewhere or the stale sweep
			// closed it. Mirror the adopt-time 'closed' branch below: stop recording,
			// clear the resume pointer so a later visit never resurrects it, and show
			// the honest terminal "this test session ended" notice. No retries.
			store.onSessionClosed = (): void => {
				if (store.cancelled) return
				ctx.logger.info('user-test session closed by server during upload; stopping recording')
				stopRecording(store)
				clearActiveSession()
				store.indicatorState = 'done'
				if (store.indicatorRoot && !merged.hideIndicator) {
					showSessionEndedScreen(store.indicatorRoot)
				}
			}

			const onFinish = (): void => {
				void finishFlow(store, ctx, { showThanks: true })
			}

			const setPanelOpen = (open: boolean): void => {
				if (store.tasksPanelOpen === open) return
				store.tasksPanelOpen = open
				writeTasksPanelOpen(open)
				renderTasksPanel(store)
			}

			const onToggleTasks = (): void => setPanelOpen(!store.tasksPanelOpen)

			const onToggleMute = (): void => {
				if (!store.hasMicPermission) {
					// In the failed terminal state the chip is a retry button:
					// re-attempt mic acquisition. Ignore taps while still
					// acquiring (connecting state is unfocusable anyway).
					if (!store.micAcquiring && store.indicatorState !== 'finishing' && store.indicatorState !== 'done' && store.indicatorState !== 'error') {
						void startRecording(store, ctx)
					}
					return
				}
				// Silent-mic warning is also a retry affordance: the participant
				// has likely switched their input device, so re-acquire the mic
				// rather than toggling mute. startRecording tears down the old
				// stream + monitor and re-runs detection on the fresh track.
				if (store.micSilent && !store.micAcquiring && store.indicatorState !== 'finishing' && store.indicatorState !== 'done' && store.indicatorState !== 'error') {
					void startRecording(store, ctx)
					return
				}
				const ok = toggleMute(store)
				if (!ok) return
				if (store.muted) {
					// Muting is intentional silence: drop any active silent-mic
					// warning so the two states don't fight. The monitor's
					// onChange suppresses re-raising it while muted.
					store.micSilent = false
					showMuteToast(store)
				}
				renderIndicatorState(store)
			}

			const closeNote = (): void => closeNotePopover(store)
			const onOpenNote = (): void => {
				if (store.notesPopoverOpen) { closeNote(); return }
				openNotePopover(
					store,
					text => {
						const atMs = store.notePopoverAtMs ?? Math.max(0, Date.now() - store.startedAt)
						const note: InFlightNote = { atMs, text, acked: false }
						store.notes.push(note)
						closeNote()
						renderNotesCount(store)
						// UI never blocks on the POST. On success we mark the note
						// acked; on failure (after one retry) it stays unacked and
						// gets included in the finalise notes batch as a recovery
						// channel. Server dedupes by (sessionId, atMs, text).
						if (store.sessionId) {
							const sessionId = store.sessionId
							void (async (): Promise<void> => {
								const result = await postNoteWithRetry(store.options.apiUrl, sessionId, atMs, text, ctx.logger)
								if (result.ok) {
									note.acked = true
									if (result.id) note.serverId = result.id
								}
							})()
						}
					},
					() => closeNote(),
				)
			}

			if (!merged.hideIndicator) {
				const host = document.createElement('div')
				host.setAttribute('data-usero-user-test', 'true')
				document.body.appendChild(host)
				store.indicator = host
				store.indicatorRoot = buildIndicator(host, store, {
					onFinish,
					onToggleTasks,
					onToggleMute,
					onOpenNote,
				})
				renderIndicatorState(store)
				renderNotesCount(store)
			}

			// Outside-click + Escape close the tasks panel. Listen on document
			// (composedPath checks shadow ancestry so taps on the panel/pill
			// itself don't dismiss).
			const outsidePointer = (event: PointerEvent): void => {
				const host = store.indicator
				if (!host) return
				const path = event.composedPath()
				if (path.includes(host)) return
				if (store.tasksPanelOpen) setPanelOpen(false)
				if (store.notesPopoverOpen) closeNote()
			}
			const onKeydown = (event: KeyboardEvent): void => {
				if (event.key !== 'Escape') return
				if (store.tasksPanelOpen) setPanelOpen(false)
				if (store.notesPopoverOpen) closeNote()
			}
			store.outsidePointerHandler = outsidePointer
			store.keydownHandler = onKeydown
			document.addEventListener('pointerdown', outsidePointer, true)
			document.addEventListener('keydown', onKeydown)

			const pageHide = (): void => {
				// PAUSE, do not finalise. A hard navigation (e.g. an OAuth round
				// trip) destroys the MediaStream, but the session must survive so
				// recording resumes on return. We stop the recorder, mark the
				// persisted state paused, and let queued chunk uploads race the
				// unload on `keepalive`. Finalisation now comes only from an
				// explicit Finish tap or the server-side stale sweep (~10 min of
				// no chunks). See pauseFlow.
				pauseFlow(store)
			}
			store.pageHideHandler = pageHide
			window.addEventListener('pagehide', pageHide)

			// visibilitychange -> hidden is the reliable mobile backstop: iOS
			// frequently backgrounds/kills a tab WITHOUT firing pagehide. It runs
			// the SAME pause path; pauseFlow is idempotent and non-terminal, so a
			// later Finish tap (or a resume) still works after the tab returns to
			// the foreground. We don't finalise here either, for the same reason.
			const onVisibilityChange = (): void => {
				if (document.visibilityState !== 'hidden') return
				pauseFlow(store)
			}
			store.visibilityHandler = onVisibilityChange
			document.addEventListener('visibilitychange', onVisibilityChange)

			void (async (): Promise<void> => {
				// Resolve the session for this leg. Three paths:
				//   1. RESUME (storage has a non-stale session): ADOPT the existing
				//      id. Never create a new one. Works even when the URL lost its
				//      `?usero_test`/`uts` params after a hard navigation.
				//   2. Entry-screen created session (`uts` in URL): ADOPT it.
				//   3. Open test (old link, no uts): CREATE a fresh session.
				// adopt is an idempotent GET, so re-adopting a still-active session
				// on resume is safe and does not disturb its server state.
				const adoptId = resumable?.sessionId ?? getAdoptSessionId()
				let created: { sessionId: string; clientId: string; tasks: UserTestTask[] } | null
				if (adoptId) {
					const adopted = await adoptSession(apiUrl, adoptId)
					if (store.cancelled) return
					if (adopted.kind === 'closed') {
						// The server says this session is already finalised/failed (e.g.
						// closed by the stale sweep). Resume must NOT resurrect it and
						// upload post-finalise chunks. Clear the resume pointer and stop:
						// no recording, no error UI (the test is legitimately over).
						ctx.logger.info('user-test session already closed on adopt; not resuming')
						clearActiveSession()
						// Don't leave the participant on a silent page with no idea the
						// test ended. Show a brief, honest terminal notice (no actions,
						// nothing to resume). Skip when the indicator is suppressed.
						if (store.indicatorRoot && !merged.hideIndicator) {
							showSessionEndedScreen(store.indicatorRoot)
						}
						return
					}
					if (adopted.kind === 'error') {
						// Transient adopt failure (fetch rejected / 5xx on flaky wifi),
						// NOT a server "closed". RETAIN the resume state so a reload can
						// retry; clearing it here would strand a still-live session. Only
						// a `closed` result (409/410, handled above) clears state. We stop
						// without recording this leg and show the retry-able error UI.
						ctx.logger.warn('user-test adopt failed transiently on resume; keeping resume state for retry')
						store.indicatorState = 'error'
						renderIndicatorState(store)
						return
					}
					created = adopted.kind === 'ok' ? adopted : null
				} else {
					created = await createSession(apiUrl, slug, readTesterName(merged.testerName))
					if (store.cancelled) return
				}
				if (!created) {
					ctx.logger.error(adoptId ? 'failed to adopt user-test session' : 'failed to create user-test session')
					// Resume's adopt failures are now fully handled above ('closed'
					// clears + returns; transient 'error' RETAINS state + returns), so a
					// resume never reaches here with created === null. This branch is the
					// createSession (fresh, non-resume) failure path. The isResume clear is
					// a defensive no-op kept in case a future code path falls through.
					if (isResume) clearActiveSession()
					store.indicatorState = 'error'
					renderIndicatorState(store)
					return
				}
				store.sessionId = created.sessionId
				store.clientId = created.clientId
				// Resolve the per-tab sdkSessionId now (once) so it can be durably
				// mirrored into the resume state and sent on finalise. On resume this
				// is the SAME id we re-seated synchronously above (so the post-nav
				// replay row joins this audio session); on a fresh start it is the
				// tab's id. Null when replay/core accessor is absent (no link to keep).
				store.sdkSessionId = ctx.getSdkSessionId ? ctx.getSdkSessionId() : null
				// Persist (or refresh) the resume pointer now that we have a session
				// id (and the sdkSessionId), BEFORE the first chunk flushes, so a hard
				// navigation in the first few seconds of recording still resumes AND
				// keeps the replay link.
				persistActiveSession(store, 'active')
				// Capture the replay offset HERE at session start (not at
				// finalise) so it reflects when the test began relative to the
				// recording. The replay plugin publishes its start epoch into
				// the core; we read it via the context. If replay is not active
				// (plugin not loaded, sampled out, or an older host without the
				// accessor) we leave it null and the finalise body omits
				// replayOffsetMs. Anchored to store.startedAt (test start),
				// clamped >= 0 in case the test starts a hair before the replay
				// epoch is published.
				const replayStartMs = ctx.getReplayStartMs ? ctx.getReplayStartMs() : null
				store.replayOffsetAtStartMs =
					replayStartMs === null ? null : Math.max(0, store.startedAt - replayStartMs)
				store.tasks = created.tasks
				if (store.tasks.length > 0 && store.indicatorRoot && !merged.hideIndicator) {
					const bar = store.indicatorRoot.querySelector('.bar')
					const finishBtn = bar?.querySelector('.finish-btn')
					if (bar instanceof HTMLElement && finishBtn instanceof HTMLElement && !bar.querySelector('.tasks-btn')) {
						installTasksToggle(bar, finishBtn, store, onToggleTasks)
					}
					renderTasksPanel(store)
				}
				await startRecording(store, ctx)
				renderIndicatorState(store)
				// Recorder is live again. If this leg was a resume across a hard
				// navigation, give the participant a brief, unobtrusive confirmation
				// that the test is still recording. No-op on a fresh start (the guard
				// checks store.resumed and clears it so it fires at most once).
				showResumedToast(store)
			})()
		},
		onDestroy(ctx) {
			const store = ctx.getStore<RecorderStore>()
			if (!store) return
			store.cancelled = true
			if (store.pageHideHandler) {
				window.removeEventListener('pagehide', store.pageHideHandler)
				store.pageHideHandler = null
			}
			if (store.visibilityHandler) {
				document.removeEventListener('visibilitychange', store.visibilityHandler)
				store.visibilityHandler = null
			}
			stopRecording(store)
			if (store.outsidePointerHandler) {
				document.removeEventListener('pointerdown', store.outsidePointerHandler, true)
				store.outsidePointerHandler = null
			}
			if (store.keydownHandler) {
				document.removeEventListener('keydown', store.keydownHandler)
				store.keydownHandler = null
			}
			for (const id of store.muteToastTimers) {
				try { window.clearTimeout(id) } catch { /* ignore */ }
			}
			store.muteToastTimers = []
			for (const id of store.resumeToastTimers) {
				try { window.clearTimeout(id) } catch { /* ignore */ }
			}
			store.resumeToastTimers = []
			if (store.indicator && store.indicator.parentNode) {
				store.indicator.parentNode.removeChild(store.indicator)
			}
			store.indicator = null
			store.indicatorRoot = null
		},
	}
}

// Internal helpers exposed for tests only. Not part of the public API.
export const __test__ = {
	getTestSlug,
	pickMimeType,
	isMediaRecorderSupported,
	classifyChunkResponse,
	handleSessionClosed,
	micChipState,
	isStreamSilent,
	rmsDbFromSamples,
	SILENCE_RMS_DB_THRESHOLD,
	SILENCE_FLOOR_DB,
	parseActiveSession,
	readActiveSession,
	clearActiveSession,
	persistActiveSession,
	adoptSession,
	ACTIVE_SESSION_MAX_AGE_MS,
	RESUME_MAX_IDLE_MS,
	ACTIVE_SESSION_STORAGE_KEY,
}
