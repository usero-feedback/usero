# @usero/sdk

The canonical Usero feedback widget and session-replay SDK. Published to npm as `@usero/sdk`. Both a vanilla JS embed and a React wrapper.

The companion server lives at `/Users/willy/projects/feedback` and is the source of the API contract this SDK speaks to.

# Releasing

## Versioning convention

Pre-1.0, default to **patch bumps** unless the change is clearly breaking. Reserve minor for genuinely new public API surface that consumers should notice. Reserve major for breaking changes.

- **Patch (0.3.4 → 0.3.5)**: bugfix, internal refactor, comment-only change, dependency bump, new optional behaviour that consumers wouldn't notice. Default.
- **Minor (0.3.x → 0.4.0)**: new public API consumers might want to opt into (a new component prop, a new exported function, a new SDK init option). Less common.
- **Major (0.x → 1.x)**: breaking change to the public API or wire format. Avoid until 1.0.

We've previously over-bumped (e.g. v0.4.0 for the declarative identify API, which was backwards compatible and could have been 0.3.5). Going forward, prefer patch.

## Release flow

Pushing a version bump to `main` triggers `.github/workflows/publish.yml`, which runs `npm publish` with the repo's `NPM_TOKEN`. **You do not need to `npm publish` locally**, and the local user is not authenticated to the `@usero` scope.

1. Bump `version` in `package.json` (patch by default).
2. Prepend a one-paragraph entry to `CHANGELOG.md`.
3. `npm run typecheck` and `npm run build`.
4. Commit `Release: @usero/sdk v<version>` (stage `package.json`, `package-lock.json`, `CHANGELOG.md` explicitly by path; no `git add -A`).
5. Push to `main`. CI publishes within ~35s.
6. Tag the release: `git tag v<version> && git push origin v<version>`.
7. Bump consumer repos (see below).

Verify the publish landed: `npm view @usero/sdk version`.

## Consumer repos to bump after a release

Consumers of `@usero/sdk` (the canonical widget, includes rrweb session replay):

- `/Users/willy/projects/feedback` (this repo's server; dogfoods its own SDK in the dashboard)
- `/Users/willy/projects/feedback-reddit-ads`

Re-derive the list when in doubt to avoid drift:

```bash
cd ~/projects
grep -rl --include=package.json -E '"@usero/sdk"' . 2>/dev/null \
  | grep -v -E 'node_modules|\.claude/worktrees|/usero/'
```

For each consumer:

1. `cd` to absolute path. Check `git status --short` is clean of unrelated changes.
2. Bump `@usero/sdk` range in `package.json` (preserve caret if present).
3. `npm install`. Verify `node_modules/@usero/sdk/package.json` shows the new version.
4. Run that repo's `npm run typecheck`.
5. Commit `Bump @usero/sdk to <version>` (stage `package.json` and `package-lock.json` by path). Push to main.

The legacy `react-feedback-collector` package is consumed by a separate list of repos (see `/Users/willy/projects/feedback/CLAUDE.md` for the legacy consumer list). Those do NOT get bumped on a `@usero/sdk` release.

# Code

- Strict TypeScript. No `any`. No `as Type` shortcuts that bypass validation.
- No emdashes anywhere in code, comments, commits, or CHANGELOG. Use commas, periods, or restructure.
- The SDK runs in customer production browsers. Treat the replay plugin as a hot path: no localStorage on every event, no per-render network, no JSON.stringify in tight loops.
- Storage failures (localStorage throwing in sandboxed iframes, Safari Lockdown, quota exceeded) must NEVER break replay capture. Wrap in try/catch with in-memory fallback. See `src/identity.ts` for the working pattern.
- Identity is monotonic: traits/email/displayName can only be added or replaced by a new identify call, never cleared. Logout (`user={null}`) rotates the anonymousId rather than nulling the existing person link.

# Build / test commands

- `npm run typecheck`: tsc with `--noEmit`.
- `npm run build`: tsup, produces ESM + CJS + DTS.
- `npm test`: builds, then runs `node --test tests/*.test.mjs`. Tests import the built ESM from `dist/`, so the build step is part of `test`. Also wired into `prepublishOnly` and the GitHub Actions publish workflow, so a failing test blocks the publish.
