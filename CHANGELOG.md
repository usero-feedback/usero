# Changelog

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
