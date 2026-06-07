// Pause + finish orchestration for the user-test plugin. pauseFlow handles a
// hard navigation (pagehide / tab hidden) by stopping the recorder WITHOUT
// finalising so the session can resume on return; finishFlow is the real
// terminal path (explicit Finish tap) that drains uploads, finalises
// server-side, and renders the thanks screen. Both tie together the recorder,
// session, and ui modules.

import type { PluginContext } from '../../plugin'
import { flushMuteIfActive, flushPendingFromIdb, startRecording, stopRecording } from './recorder'
import { clearActiveSession, finaliseSession, persistActiveSession, postPayout } from './session'
import type { PaymentSummary, RecorderStore } from './shared'
import { renderIndicatorState, showThanksScreen } from './ui'

// Pause the recording for a hard navigation (pagehide / tab hidden) WITHOUT
// finalising. The browser is about to tear down the MediaStream, so we stop the
// recorder and let its queued chunk uploads race the unload on `keepalive`. The
// session stays open server-side; it resumes on return (storage carries the
// resume pointer), or the server-side stale sweep finalises it after ~10 min if
// the participant never comes back. This replaces the old pagehide->finalise,
// which permanently closed a session the participant intended to continue.
//
// Idempotent + non-destructive: it does NOT set finishFlowRan or move the
// indicator to a terminal state, so a real Finish tap after resume still works.
// Safe to call repeatedly (stopRecording tolerates an already-stopped recorder).
export function pauseFlow(store: RecorderStore): void {
	if (store.cancelled) return
	// Already finishing/finished for real: nothing to pause.
	if (store.finishFlowRan || store.indicatorState === 'finishing' || store.indicatorState === 'done') return
	// No live session yet (still creating/adopting): nothing to persist or stop.
	if (!store.sessionId) return
	// Flag paused BEFORE stopRecording so the final trailing `dataavailable` chunk
	// that recorder.requestData()/stop() flushes (which routes through
	// enqueueChunk -> persistActiveSession) writes 'paused' and keeps pausedAt,
	// rather than overwriting the entry with 'active' and dropping the idle clock.
	store.paused = true
	flushMuteIfActive(store)
	stopRecording(store)
	// Mark the persisted state paused at the current chunk index. The queued
	// uploads (each `keepalive` where small enough) continue draining as the
	// page unloads; the resume picks up from store.chunkIndex.
	persistActiveSession(store, 'paused')
}

export async function finishFlow(store: RecorderStore, ctx: PluginContext, opts: { showThanks: boolean }): Promise<void> {
	if (store.cancelled) return
	// Short-circuit re-entry. The pagehide handler and the manual Finish click
	// can race; server is also idempotent on a second finalise call, but doing
	// the local work twice (flushing mute, draining queues, etc.) is wasted.
	if (store.finishFlowRan) return
	if (store.indicatorState === 'finishing' || store.indicatorState === 'done') return
	store.finishFlowRan = true
	store.indicatorState = 'finishing'
	flushMuteIfActive(store)
	renderIndicatorState(store)

	stopRecording(store)
	// Wait for the queued uploads to drain. Each upload already has its own
	// retry/backoff; this just lets them finish before finalise fires.
	await store.uploadQueue
	await flushPendingFromIdb(store, ctx)

	const durationSeconds = (Date.now() - store.startedAt) / 1000
	// Replay linkage, computed once and sent on every finalise call for this
	// session. sdkSessionId is the core-owned per-tab id (the primary key the
	// server uses to resolve the SessionReplay); replayOffsetMs is the offset
	// captured at session start, only set when replay was active. Both degrade
	// gracefully to absent. Sending it on the second (end-note) finalise too
	// is harmless: the server stores idempotently.
	const replayLinkage: { sdkSessionId?: string; replayOffsetMs?: number } = {}
	const linkageSdkSessionId = ctx.getSdkSessionId ? ctx.getSdkSessionId() : undefined
	if (linkageSdkSessionId) replayLinkage.sdkSessionId = linkageSdkSessionId
	if (store.replayOffsetAtStartMs !== null) {
		replayLinkage.replayOffsetMs = store.replayOffsetAtStartMs
	}
	// Payment summary from the first finalise response drives the finished screen
	// (complete vs ended-early, reward headline, one-tap payout default).
	let payment: PaymentSummary | null = null
	if (store.sessionId) {
		// First finalise carries durationSeconds + mutedSegments + any un-acked
		// notes (recovery channel). End-of-test note is sent via a second
		// finalise call from the thanks screen.
		const unackedNotes = store.notes.filter(n => !n.acked).map(n => ({ atMs: n.atMs, text: n.text }))
		const result = await finaliseSession(store.options.apiUrl, store.sessionId, durationSeconds, {
			mutedSegments: store.mutedSegments,
			notes: unackedNotes,
			...replayLinkage,
		})
		if (result.ok) {
			payment = result.payment
			// Mark the un-acked notes we just shipped as acked so the second
			// finalise call doesn't resend them.
			for (const n of store.notes) {
				if (!n.acked) n.acked = true
			}
		}
		store.indicatorState = result.ok ? 'done' : 'error'
		// Genuine, server-confirmed finalisation: clear the persisted resume
		// state so a later unrelated visit never tries to resume this closed
		// session. On error we keep it so the resume / server stale sweep can
		// still own the session.
		if (result.ok) clearActiveSession()
	} else {
		store.indicatorState = 'error'
	}
	renderIndicatorState(store)

	if (opts.showThanks && store.indicatorRoot && store.indicatorState === 'done') {
		showThanksScreen(store.indicatorRoot, {
			payment,
			onPayout: async destination => {
				if (!store.sessionId) return false
				return postPayout(store.options.apiUrl, store.sessionId, destination, ctx.logger)
			},
			onResume: () => {
				// Re-arm an ended-early session: the recording was already stopped +
				// finalised, so resuming starts a fresh recording leg under the same
				// sessionId. The server is idempotent on a later finalise; the new
				// audio chunks continue the same R2 prefix. Reset the finish guard
				// and timeline anchor so the next Finish re-evaluates completion.
				store.finishFlowRan = false
				store.indicatorState = 'recording'
				store.startedAt = Date.now()
				store.muted = false
				store.mutedSinceMs = null
				// Re-arm the persisted resume state: the participant chose to keep
				// going, so a hard navigation during this new leg should resume too.
				persistActiveSession(store, 'active')
				renderIndicatorState(store)
				void startRecording(store, ctx)
			},
			onSubmitNote: async text => {
				if (!store.sessionId) return
				store.endNote = text
				// Second finalise only carries the late-binding fields. mutedSegments
				// already landed on call 1, server stores idempotently, no need to
				// resend. Include any notes that arrived (or failed to ack) between
				// the two calls.
				const stillUnacked = store.notes.filter(n => !n.acked).map(n => ({ atMs: n.atMs, text: n.text }))
				const result = await finaliseSession(store.options.apiUrl, store.sessionId, durationSeconds, {
					endNote: text,
					notes: stillUnacked,
					...replayLinkage,
				})
				if (!result.ok) throw new Error('finalise failed')
				for (const n of store.notes) {
					if (!n.acked) n.acked = true
				}
			},
			onSkip: () => { /* nothing to send */ },
		})
	}
}
