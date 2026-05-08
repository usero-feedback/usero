# Changelog

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
