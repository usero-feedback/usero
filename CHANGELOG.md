# Changelog

## 1.1.11

Patch. Session replay now records SPA client-side route changes as rrweb `url-change` custom events. The session-replay plugin patches `history.pushState` and `history.replaceState` and listens for `popstate`, emitting a custom event with the new URL whenever the route changes after the initial page load. Previously a recording carried only the Meta href captured at recording start, so any in-app navigation in a single-page app was invisible to the player; recordings now reflect the URL the user was actually on for each part of the session. Backwards compatible: this is additive, the new events sit alongside the existing rrweb stream, and any consumer that does not read `url-change` events is unaffected. No public API or wire-format changes.

## 1.1.10

Patch. User-test recording: add a silent-microphone guard. A dead mic, or a virtual audio input device that macOS sometimes hands Chrome (e.g. "Background Music", a Zoom or Teams virtual mic), delivers digital silence; getUserMedia succeeds and MediaRecorder happily records nothing, so 15 minutes of silence used to reach the researcher with no warning. The plugin now runs a Web Audio AnalyserNode over the live track and computes RMS in dBFS at record start and continuously during recording. The decision is a pure, unit-tested function: a window is treated as silent only when RMS is at or below -60 dBFS (effectively digital zero). That bar is deliberately conservative so a quiet but real voice never trips it: confirmed real speech in our data sits around -36 dB and even a soft talker around -40 to -50 dB, all comfortably above the line. When sustained silence (~1.8s) is detected, the recording pill surfaces a non-blocking warning that reuses the existing "Mic blocked, tap to retry" treatment with new copy ("We can't hear you, tap to recheck"); tapping re-acquires the mic so a participant who switched their input device can recover. Recording, replay, and finalise are never gated on it, and a quiet participant is never stopped. The warning auto-clears the moment real audio returns, and is suppressed while the participant has deliberately muted. The AnalyserNode and AudioContext are torn down on stop and destroy with no lingering nodes. Backwards compatible: no public API or wire-format changes.

## 1.1.9

Patch. Fix a publishing regression in 1.1.8: the published tarball was missing `dist/plugins/user-test.d.ts`, so consumers importing `@usero/sdk/plugins/user-test` got TS7016 "Could not find a declaration file" even though the `.js`/`.cjs` for that subpath shipped fine. Root cause was tsup's shared DTS-emit step silently dropping one entry's declaration in CI while still reporting build success, leaving the exports map pointing at a file that did not exist. No source change was needed (a clean build emits every declaration; typecheck passes), so this is a build-integrity fix rather than a code fix. To stop it recurring, the build now ends with a dependency-free `scripts/verify-dist.mjs` guard that reads the package.json `exports` map and fails the build loudly if any declared entry point, especially a `.d.ts`, is missing or empty in `dist`. A broken artifact can no longer reach npm. Backwards compatible: no public API or wire-format changes.

## 1.1.8

Patch. Recording-lifecycle resilience so a torn-down tab rarely leaves a session stuck un-finalised. (1) Both the user-test and session-replay plugins now finalise on `visibilitychange` -> `hidden`, not just `pagehide`. visibilitychange fires far more reliably than pagehide on mobile, where iOS routinely kills a backgrounded tab without ever firing pagehide. The new handler runs the exact same finalise/flush path as pagehide and is idempotent: user-test reuses its existing `finishFlowRan` + indicatorState short-circuit, and session-replay gates on a shared `stopped` flag, so the manual Finish, pagehide, and visibilitychange triggers can fire in any order or concurrently and only the first does the work (the server is also idempotent on a second finalise). user-test's unload finalise already rode on `fetch(..., { keepalive: true })` and replay's already used `navigator.sendBeacon`, so both survive the tab being torn down. (2) The user-test audio chunk cadence drops from 30s to 10s, so at most ~10s of audio is at risk if the tab dies before a flush, and a session shorter than the old 30s window now reliably emits at least one chunk (previously its single buffered chunk was never flushed and its audio was lost). Tradeoff: roughly 3x the chunk-upload requests per session, an acceptable balance. Backwards compatible: no public API or wire-format changes.

## 1.1.7

Patch. User-test recording pill: stop flashing the "No mic, replay only" failure label to participants who actually granted mic access. The pill used to render before `getUserMedia()` resolved, so granted users briefly saw the terminal failure copy. There is now an explicit "connecting" mic chip state ("Connecting mic", steady amber tint with a gentle breathing icon, distinct from both the live red pulse and the failed state) shown while acquisition is pending, so granted users never see failure copy. The genuinely-failed terminal state is now actionable: it reads "Mic blocked, tap to retry" (or "No mic found, tap to retry" when no device is present), is keyboard-focusable, and re-invokes mic acquisition on click or Enter. Replay keeps recording in every state. Backwards compatible: no public API or wire-format changes.

## 1.1.6

Patch. Feedback widget: stop sending an empty-string `userEmail` when the "share my email" box is checked but no address is typed. We now only attach the email when it is non-empty after trimming, matching the existing comment-trim pattern. Previously the empty string reached the server and tripped its email validation, surfacing as an internal server error to the user. Backwards compatible: no public API or wire-format changes.

## 1.1.5

Patch. User-test plugin: redesign the finished screen for the participant pay flow. When a session completes, the screen now confirms completion with verified checks (tasks, voice recording, screen replay) and captures the payout destination in one tap, defaulting to "Send my $X to <sign-up email>" with a quieter "Use a different email" expander. The destination POSTs to the new `/api/user-test-sessions/:id/payout` endpoint. When a session ends before the tasks are finished, the screen shows a warmer "Looks like you stopped early" state with per-task progress, a primary "Resume where I left off" action, and a graceful non-punishing exit. The finalise response now carries a `payment` summary (qualified, reward, payout email, tasks done/total) so the SDK can pick the right state; older servers that omit it degrade to a neutral "saved" confirmation. Re-skinned to the Usero warm-stone palette. Backwards compatible: no public API or wire-format changes for hosts.

## 1.1.4

Patch. User-test plugin: adopt a server-created session via the `uts` URL param instead of always minting its own. The Usero participant pay flow now creates the UserTestSession on the entry screen (so it carries the tester's email and recording consent from the start) and redirects to the customer site with `&uts=<id>`. When the plugin sees `uts`, it GETs the new `/api/user-test-sessions/:id/adopt` endpoint for the clientId + tasks and records against that existing session, rather than POSTing a fresh one. This prevents the double-session bug (one emailed, one anonymous). Backwards compatible: open tests using the old `?usero_test=<slug>` link with no `uts` still fall back to creating their own session, so older entry pages keep working. A present-but-unresolvable `uts` surfaces the error state rather than silently creating a second anonymous session.

## 1.1.3

Patch. Fix the feedback widget discarding what you typed while a screenshot uploaded. Adding a screenshot triggered a full panel re-render on upload start and finish, which rebuilt the comment textarea, stole focus and the caret, and wiped any text typed during the upload, so it read as the popup resetting itself mid-typing. Upload state now updates surgically (only the pick button label and the preview/error row), leaving the textarea and your in-progress text untouched. As a guard, an in-flight upload or submit can no longer be dismissed by an accidental backdrop tap or a stray Escape; the explicit close button and floating toggle still close it.

## 1.1.2

Patch. Moved cross-cutting identity (sdkSessionId, anonymousId, userId) into the SDK core so every plugin reads one source of truth via the plugin context, instead of each plugin minting its own. The session-replay plugin now reads the per-tab sdkSessionId from the core (reusing its existing `usero:session-replay:sdk-session-id` sessionStorage key, so no id rotation in customer browsers) and publishes its recording start epoch into the core. The user-test plugin now attaches the replay linkage at finalise: it sends the core-owned sdkSessionId (the primary key the server uses to resolve the SessionReplay) and, when replay was active, a replayOffsetMs captured at the moment the test started. Both finalise fields are optional, so older servers tolerate them and a test with no active replay still finalises cleanly. user-test does not import the replay plugin, so rrweb stays out of its bundle.

## 1.1.1

- User-test plugin: fix four reliability bugs surfaced by code review. (1) Notes no longer silently vanish on transient POST failure: each note now tracks `acked` + `serverId`, gets one immediate retry on network errors / 5xx / 408 / 429, and any still-unacked notes are batched into the finalise call via the new `notes: [{atMs, text}]` field (server caps at 200, dedupes by sessionId+atMs+text). (2) Thanks-screen end-note submit no longer freezes the UI when the second finalise call fails or hangs: a 30s timeout via `Promise.race` flips a hung request to error, the textarea and buttons re-enable, and a small inline message reads "Couldn't save your note. Try again?" so the participant can retry. (3) `finishFlow` now guards against re-entry with a `finishFlowRan` flag, so the pagehide handler racing the manual Finish click can't double-flush mute segments or double-drain the upload queue. (4) `showMuteToast` setTimeout ids are stashed on the store and cleared in `onDestroy`, with defensive `isConnected` checks inside the timer callbacks so a teardown mid-fade can't blow up on a detached node. Plus a small cleanup: the second finalise call from the thanks screen no longer resends `mutedSegments` (idempotent server-side, just wasteful), only the late-binding `endNote` plus any newly-unacked notes.

## 1.1.0

- User-test plugin: three new participant-facing surfaces on the floating pill. (1) Mic mute toggle: the existing mic chip becomes a real button with three states (recording, muted, no-mic-ever-granted). Muting disables the audio track on the MediaStream so the single MediaRecorder lifecycle stays intact and the gap becomes verified silence in the output WebM (RMS confirmed 0.0000 on Chrome between two non-zero tone segments at 0.35). Muted segments are tracked as `{startMs, endMs}[]` and sent on finalise so the dashboard scrubber can render amber bars. A one-time helper toast on first-ever mute reassures the participant that screen recording continues; the persistent amber chip is the ongoing reminder. (2) In-flight timestamped notes: a new speech-bubble button on the pill opens a popover anchored above it with a single textarea, Cmd or Ctrl plus Enter to save, ghost Cancel and solid Save. Notes are posted fire-and-forget to `POST /api/user-test-sessions/:id/notes` with `{atMs, text}` and shown as a count on the pill once any exist. (3) End-of-test comment: optional textarea on the thanks card with soft prompt placeholder copy, visually-equal Skip and Send buttons, Cmd or Ctrl plus Enter to send. Empty submissions are not sent. All three pieces live inside the existing closed shadow root, stretch the pill width gracefully on mobile via 38px touch targets, and respect prefers-reduced-motion.

## 0.5.3

- Session replay: close the remaining FullSnapshot chunk-drop window. v0.5.2 flushed the pre-snapshot buffer so the snapshot didn't inherit the previous up-to-3s of incrementals, but the snapshot chunk could still accumulate up to chunkSeconds of POST-snapshot mutations and cross the 4MB gzipped hard cap. v0.5.3 adds an unconditional post-snapshot flush so the snapshot ships in its own chunk. Pre- and post-flush share a single `lastSnapshotFlushAt` rate-limit window (`SNAPSHOT_ISOLATION_MIN_GAP_MS`) so SPA route-change bursts can't trigger a flush storm. Refactored the emit-handler logic into a top-level testable `maybeIsolateSnapshot(store, ctx, event, now)` helper, with unit tests covering the non-snapshot no-op, empty-buffer first-snapshot, populated-buffer pre-flush, rate-limit gating, boundary case, and the >4MB hard-cap drop counter.

## 0.5.2

- Session replay: isolate rrweb FullSnapshot events into their own chunk so the 4MB-gzipped hard cap can't drop the playback anchor. When a FullSnapshot (rrweb event type 2) arrives, the pre-snapshot pending buffer is flushed first so the snapshot lands in a near-empty chunk, dramatically reducing the chance of a combined chunk crossing the cap and taking the anchor (and the following minute of playback) with it. Rate-limited to one isolation flush per 1500ms to prevent flush storms on SPA route-change snapshot bursts.
- Session replay: count the 4MB hard-cap drop in `droppedSinceLastUpload` so the next successful chunk PUT surfaces it via the `X-Usero-Dropped-Before` header. Previously these oversized drops were silent server-side; now the viewer can render a gap marker.

## 0.5.1

- Feedback widget: restore autofocus on the comment textarea. Focuses on panel open and again after the user picks a rating, so they can start typing immediately. Uses `requestAnimationFrame` + `preventScroll` to avoid fighting the open animation.

## 0.4.2

- Session replay: drop the per-event `JSON.stringify(event).length` from the rrweb emit hot path. It was burning CPU on busy SPAs (hundreds of events/sec) and `.length` is UTF-16 unit count, not bytes, so it under-counted non-ASCII by ~2x. Replaced with a cheap per-event-type heuristic (full snapshots ~50KB, incrementals ~256B, everything else ~128B). `chunkMaxBytes` remains an approximate safety net; `chunkMaxEvents` is the primary signal between flushes.
- Session replay: when the in-flight upload queue is saturated and a chunk is dropped, track a counter and surface it on the next successful chunk PUT via the `X-Usero-Dropped-Before` header so the playback viewer can render a gap marker. Reset on success.
- Tests: wire `node --test tests/*.test.mjs` into `npm test`, `prepublishOnly`, and the GitHub Actions publish workflow so regressions block publish. Fix `createSession` test calls to pass `anonymousId` and assert it serializes into the request body.

## 0.4.1

- Session replay: tighten memory-retention defaults so consumers don't have to tune anything. The plugin now passes `checkoutEveryNms: 60_000` to rrweb so the mirror resets every 60s and detached SPA subtrees become GC-eligible. Default flush cadence drops from 10s to 3s and the per-chunk event cap from 5000 to 1000, plus a new `chunkMaxBytes` cap (default ~512 KB pre-gzip) forces a flush on event-heavy pages before the buffer balloons. The in-flight upload queue is capped at 3, and further chunks are dropped with a rate-limited warn rather than stacking event arrays in closures on slow networks. All knobs (`chunkSeconds`, `chunkMaxEvents`, `chunkMaxBytes`, `checkoutEveryMs`) are exposed as `SessionReplayOptions` for advanced tuning. `onDestroy` also nulls out the rrweb `record` reference for cleanliness.

## 0.4.0

- User identity: declarative-first identification with `sendBeacon` durability. The session-replay plugin now persists an `anonymousId` in `localStorage` and includes it when opening a `SessionReplay` row, so anonymous sessions stay stitched across reloads and tabs. `UseroFeedbackWidget` (React) accepts a `user` prop and the vanilla `init()` accepts a `getUser` callback, both of which flow through to replay session creation and are re-sent on identity change. Finalisation on `pagehide` now uses `navigator.sendBeacon` so the last chunk and identity update survive tab close. The imperative `handle.identify()` API is preserved as an escape hatch for non-declarative flows.

## 0.3.4

- Session replay: rewrite plugin to chunked-upload contract. The plugin no longer buffers events and attaches them to the feedback submit; instead it mints an `sdkSessionId` per tab, opens a `SessionReplay` row server-side via `POST /api/replay-sessions` (with bot-gate decision), streams gzipped chunks via `PUT /api/replay-sessions/:id/chunks/:seq`, and finalises on tab unload via `sendBeacon`. Exposes `getCurrentSession()` so the user-test plugin and feedback submit path can attach `sessionReplayId` + `replayOffsetMs` pointers. Sessions that never submit feedback are now captured.

## 0.3.3

- Session replay: capture interactions inside the widget's shadow root. The vanilla widget now dispatches a `usero:shadow-update` `CustomEvent` on `window` when its shadow root is mounted and again whenever the panel opens. The session-replay plugin listens for this signal and calls `record.takeFullSnapshot(true)`, which causes rrweb to walk into the shadow tree and register it with `shadowDomManager`. Without this, the widget host was captured but the shadow-tree mutations (rating click, comment input, submit) were silently dropped from recordings.

## 0.3.1

- Bump `rrweb` from `2.0.0-alpha.4` to `2.0.0-alpha.20` (~3 years of fixes). Resolves `TypeError: e.matches is not a function` thrown from `genAdds` / `processMutations` on customer sites — non-Element nodes were hitting `isBlocked`'s `.matches()` call inside the MutationObserver callback, which was uncatchable from our `try/catch` around `record()`. The path is hardened in newer alphas.

## 0.2.1

- Fix: chars-remaining counter no longer hijacks the first rating tile. The counter previously targeted an ambiguous selector (`.fb-cnt form > div > div`) that resolved to the first rating card after the first textarea input, overwriting the "Needs work" emoji with the chars-remaining text. Now uses a stable `[data-role="charcount"]` hook.
- Fix: panel layout no longer clips the Send Feedback button on small viewports when the share-email checkbox is shown. Tightened vertical spacing around the textarea, char count, screenshot row, email row, and submit button, and gave the mobile breakpoint more `max-height` headroom.

## 0.2.0

- Auto-detect OS color scheme via `prefers-color-scheme`. Widget picks `DARK_THEME` or `DEFAULT_THEME` (light) automatically.
- Defaults to `DARK_THEME` when no preference is reported (SSR, old browsers, no signal).
- Live theme swap when the OS scheme flips while the widget is mounted (no re-init needed).
- Explicit `theme` prop still wins. Passing `theme` disables auto-detection until you clear it (pass `theme: undefined` via `update()`).
- New helper `resolveTheme(userTheme)` exported from the vanilla entry for advanced consumers.

## 0.1.0

- Initial release. Vanilla, React, and IIFE builds of `@usero/sdk`.
