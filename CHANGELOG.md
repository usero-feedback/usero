# Changelog

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
