# Changelog

## 0.2.0

- Auto-detect OS color scheme via `prefers-color-scheme`. Widget picks `DARK_THEME` or `DEFAULT_THEME` (light) automatically.
- Defaults to `DARK_THEME` when no preference is reported (SSR, old browsers, no signal).
- Live theme swap when the OS scheme flips while the widget is mounted (no re-init needed).
- Explicit `theme` prop still wins. Passing `theme` disables auto-detection until you clear it (pass `theme: undefined` via `update()`).
- New helper `resolveTheme(userTheme)` exported from the vanilla entry for advanced consumers.

## 0.1.0

- Initial release. Vanilla, React, and IIFE builds of `@usero/sdk`.
