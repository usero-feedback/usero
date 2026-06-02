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

`@usero/sdk` (the canonical widget, includes rrweb session replay) is dogfooded across MANY of the user's projects, not just `feedback`. As of the last count it was ~18 repos and growing. **There is NO hardcoded consumer list. Do NOT bump "just feedback and feedback-reddit-ads" or any other remembered short list.** Default intent is BUMP EVERY CONSUMER. The grep below is the source of truth, re-run it every release:

```bash
cd ~/projects
grep -rl --include=package.json -E '"@usero/sdk"' . 2>/dev/null \
  | grep -v -E 'node_modules|\.claude/worktrees|/usero/'
```

Every path it prints has `@usero/sdk` literally in its `package.json` (the grep filters on that exact string), so every one is a real consumer to bump. They are NOT legacy `react-feedback-collector` repos, the grep cannot match those. The fuller policy (why bump everything, don't pause to ask about scope or major bumps) lives in `/Users/willy/projects/feedback/CLAUDE.md` under "Releasing a new widget version, bump consumers". Follow that.

For each consumer the grep returns:

1. `cd` to its absolute path.
2. Check the branch: `git rev-parse --abbrev-ref HEAD`. SKIP and report if NOT on `main` (the grep also surfaces sibling git worktrees that sit on feature branches, e.g. `feedback-transcript-content-fix`, `groceries-progressive-upload`; only bump+push repos on `main`).
3. If `package.json` or its lockfile is ALREADY dirty before you touch it, SKIP and report (another session may be mid-bump). Unrelated dirty files are fine, leave them.
4. Bump the `@usero/sdk` range in `package.json` (preserve caret if present).
5. Install with the matching package manager (`npm install` / `pnpm install` / `yarn install` per the lockfile present). Verify `node_modules/@usero/sdk/package.json` shows the new version.
6. Run that repo's `npm run typecheck` if it has one. Some repos carry pre-existing typecheck errors unrelated to the SDK (verify against the baseline dep files if unsure); only block the commit on a NEW failure the bump introduced.
7. Stage ONLY `package.json` + the matching lockfile by explicit path. Commit `Bump @usero/sdk to <version>`. Push to `main`.

The legacy `react-feedback-collector` package is consumed by a separate list of repos (see `/Users/willy/projects/feedback/CLAUDE.md` for the legacy consumer list). Those do NOT get bumped on a `@usero/sdk` release, and the grep above never matches them anyway.

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
