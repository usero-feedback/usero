# SDK performance

How fast a feedback submit feels, what guards it, and how to check it. Read this before changing the submit path, the replay
plugin or anything that grows the bundle, and before every release.

## The submit critical path rule

From the Submit click to the feedback POST there are **zero awaited network requests and zero capture work**, in every recording
mode. The success UI is never blocked either: nothing heavy runs on the main thread between the click and the thank-you message.

- `onFeedbackSubmit` plugin hooks run before the POST. They return synchronously from memory (the replay plugin only attaches
  the id of a recording that is already live).
- Everything slow hangs off `afterFeedbackSubmit`, which runs once the POST is on the wire and is never awaited. The replay
  plugin waits there for the returned feedback id and a paint plus idle callback, asks in Ask first mode, captures the page
  snapshot, then creates a snapshot-only session with `feedbackId` (a `keepalive` request). The server links the snapshot to
  the feedback when it accepts that create, so the link never depends on the chunk upload finishing.
- rrweb is loaded when the feedback panel opens (or already running for an ambient recording), never on the Submit click.

Why: on 2026-10-02 a Sydney user waited 1.5 s extra on every submit while the old snapshot path ran before the POST, and the
replay link was lost every time the chunk upload (1.5 s median in the US, 2.6 s from SIN) overran its budget.

## Guards

| Guard | Where | Fails when |
| --- | --- | --- |
| Critical path test | `tests/submit-critical-path.test.mjs` (`npm test`) | Any request is started before the feedback POST, or the POST leaves more than 60 ms after submit with 300 ms per request, in any mode; or the replay link does not land afterwards |
| Bundle budgets | `scripts/verify-dist.mjs` (`GZIP_BUDGETS`, runs in `npm run build`) | Any exported entry (entry file plus the chunks it imports statically) or the lazy rrweb chunk grows past its gzipped budget, or a new entry has no budget |
| Browser timing | `scripts/perf-submit.mjs` (`npm run perf`) | A scenario median goes over budget in throttled Chromium, a run loses its replay link, or a page snapshot contains the widget or consent prompt |
| Server round trips | `app/utils/feedbackSubmitRoundTrips.test.ts` (monorepo `npx vitest run`) | `POST /api/feedback` makes more than 2 serial D1 round trips before responding (3 with screenshots) |

## `npm run perf`

Builds, then boots a static host page (a product listing of a few thousand nodes) and a cross-origin mock API, and drives the
real vanilla widget plus `sessionReplay()` in Playwright's own headless Chromium. CDP throttling: 250 ms latency, 4 Mbps down,
1.5 Mbps up, 4x CPU slowdown. Three scenarios, 5 runs each, about 90 s in total:

- `live`: an ambient recording is running, so its id rides in the POST.
- `snapshot`: Always mode with no recording live (sampled out), so a page snapshot is taken after the submit.
- `ask`: Ask first mode, the harness clicks Include on the prompt.

Flags: `--runs N`, `--scenario live|snapshot|ask`, `--sdk <dist dir>` to measure another build (for example an older release
built into a scratch dir), `--json <file>`, `--no-budget` for a baseline that never fails, and `--api <url> --client <id>` to run
against a real Usero server (a local dev server, for example) instead of the mock.

Reading the output: one line per run, then a median table.

- `clickToPost`: Submit click to the feedback `fetch()` call. Should be a few ms.
- `clickToSuccess`: click to the first frame after the thank-you message renders. With 250 ms latency the floor is one round
  trip plus server time.
- `longTaskToSuccess`: main-thread long-task time (PerformanceObserver `longtask`) between the click and the success frame.
- `longTask5s`: long-task time in the 5 s after the click. Includes the snapshot serialise, which runs after the success frame.
- `snapshotLoad` / `snapshotSerialise`: the rrweb chunk load and the DOM serialise of the snapshot (User Timing entries
  `usero:snapshot-load` and `usero:snapshot-serialise`). Load is near 0 because rrweb is preloaded on panel open.
- `linked`: runs where the replay ended up linked (in the POST for `live`, at snapshot create otherwise).
- `requests before the POST` lists anything fetched between the click and the POST; on a healthy build it does not print.

## Budgets

Measured 2026-10-03 on the fast-submit build, medians of 5 runs. That build was developed as 1.5.1, never published on its own,
and shipped in 1.6.0. The task dir `docs/pm/tasks/fast-feedback-submit/` in the monorepo has the raw JSON for both columns.

| Metric | 1.5.0 (snapshot / ask) | Fast-submit build | Budget |
| --- | --- | --- | --- |
| clickToPost | 1509 / 1575 ms | 5 to 18 ms | 50 ms |
| clickToSuccess | 1789 / 1855 ms | 283 to 309 ms | 400 ms |
| longTaskToSuccess | 141 / 142 ms | 0 ms | 50 ms |
| longTask5s | 141 / 142 ms | about 135 ms (serialise, after success) | 300 ms |
| replay linked | 0 of 5 runs | 5 of 5 | every run |

Bundle budgets are about 5% over the fast-submit build's gzipped sizes and live in `GZIP_BUDGETS` in `scripts/verify-dist.mjs`.
The six replay entries were then reset to about 5% over 1.6.0 to make room for the replay upload lane from the chunk-loss fix,
and tightened again once the `__test__` seams moved out of the published bundle (about 12.3 KB gz, budgets 12.9 to 13.1 KB).

**Raising any budget needs Will's OK.** Shrink the change first. If a budget has to move, say why in the commit and update the
table above.

## When to run it

Run `npm run perf` before any change that touches the submit path, the replay plugin or bundle size, and before every release.
It is not in CI: it needs a Chromium download and takes about 90 s, and throttled wall-clock timing on shared CI runners is
noisy enough to flake. The deterministic guards (critical path test, bundle budgets, round-trip test) do run in CI.
