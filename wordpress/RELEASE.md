# Releasing the Usero WordPress plugin

This is the runbook for shipping the plugin to wordpress.org. Two phases: the
one-time submission, and the recurring release cut (now fully automated via
GitHub Actions).

## Layout

- The WordPress plugin lives in `wordpress/` inside the `@usero/sdk` repo. SDK
  and plugin share a single version, driven by the root `package.json`.
- The vendor file at `wordpress/assets/js/vendor/usero-sdk.iife.js` is
  regenerated on every `npm run build` (run from the repo root). Do not edit
  it by hand.

## First-time setup

Before the first automated release can run, do this once:

1. Submit the plugin to wordpress.org (see "One-time: first WP.org submission"
   below). Wait for approval. WP.org will email SVN credentials.
2. In the GitHub repo, go to **Settings -> Secrets and variables -> Actions**
   and add two repository secrets:
   - `SVN_USERNAME` (your wordpress.org username)
   - `SVN_PASSWORD` (your wordpress.org password)
3. Make sure Actions are enabled for the repo (Settings -> Actions -> General).

That is all. The `.github/workflows/release-wordpress.yml` workflow will then
fire on every `v*` tag push and deploy to SVN.

## Cutting a release

The recurring path is now: bump version, commit, tag, push. GitHub Actions
does the SVN dance.

1. **Decide the new version.** Semver. Patch for bug fixes, minor for
   features, major for breaking config changes.
2. **Bump version in all four places. They must match exactly:**
   - Root `package.json` `version`
   - `wordpress/usero.php` header `Version: X.Y.Z`
   - `wordpress/usero.php` constant `define( 'USERO_VERSION', 'X.Y.Z' );`
   - `wordpress/readme.txt` `Stable tag: X.Y.Z`
3. **Update `wordpress/readme.txt`:**
   - Add a `== Changelog ==` entry under the new version
   - Add a terse `== Upgrade Notice ==` entry (one or two sentences, shown
     to users on the WP plugin update screen)
4. **Refresh the vendored SDK.** From the repo root, run `npm run build`.
   This runs `scripts/sync-wp-vendor.mjs`, which rewrites
   `wordpress/assets/js/vendor/usero-sdk.iife.js` and stamps
   `USERO_SDK_VERSION` in `wordpress/usero.php` to match the root
   `package.json` version.
5. **Smoke test locally.** See `SMOKE.md`.
6. **Commit, tag, push.**

   ```bash
   git add package.json wordpress/usero.php wordpress/readme.txt wordpress/assets/js/vendor/usero-sdk.iife.js
   git commit -m "Release X.Y.Z"
   git tag vX.Y.Z
   git push --follow-tags
   ```

The release workflow then:

1. Checks out the tag, runs `npm ci` and `npm run build`.
2. Verifies version consistency across `package.json`, the git tag,
   `wordpress/usero.php` (header + constant), and `wordpress/readme.txt`.
   If any mismatch, the workflow fails before it touches SVN.
3. Runs `10up/action-wordpress-plugin-deploy@stable`, which pushes
   `wordpress/` into SVN `trunk/`, copies it to `tags/X.Y.Z`, and syncs
   `wordpress/assets/` into SVN `assets/` (the marketplace listing artwork).

Listing goes live within minutes of the workflow completing.

## Version-bump checklist

Before pushing the release tag:

- [ ] Root `package.json` `version` bumped
- [ ] `wordpress/usero.php` `Version:` header bumped (same value)
- [ ] `wordpress/usero.php` `USERO_VERSION` constant bumped (same value)
- [ ] `wordpress/readme.txt` `Stable tag:` bumped (same value)
- [ ] `wordpress/readme.txt` `== Changelog ==` has a new entry
- [ ] `wordpress/readme.txt` `== Upgrade Notice ==` has a new entry
- [ ] `npm run build` ran successfully and the vendor file regenerated
- [ ] Smoke test passes (`SMOKE.md`)

## Listing assets (banner, icon, screenshots)

These ship via the SVN `assets/` directory, NOT inside the plugin zip. WP.org
loads them straight from SVN for the marketplace listing. With the GHA flow,
anything inside `wordpress/assets/` at tag time is published to SVN `assets/`
by the `ASSETS_DIR` arg in the workflow.

Required file names:

- `banner-1544x500.png` and `banner-772x250.png` (header banner)
- `icon-128x128.png` and `icon-256x256.png` (listing icon)
- `screenshot-1.png`, `screenshot-2.png`, ... (numbered, no other naming
  scheme works; order MUST match the `== Screenshots ==` block in
  `readme.txt`)

Anything in `wordpress/assets/` that is NOT marketplace artwork (banners,
icon, numbered screenshots) is wasted SVN bytes. Move dev artifacts to
`wordpress/dev-artifacts/` (already gitignored) before tagging.

## One-time: first WP.org submission

1. Submit at https://wordpress.org/plugins/developers/add/. Upload a zip
   built from a clean copy of `wordpress/` only (no `dev-artifacts/`, no
   `.git`, no `node_modules`).
2. Reviewers look for:
   - GPL-compatible license declared in `usero.php` and `readme.txt`
   - No remote-loaded scripts. Our SDK is vendored to
     `wordpress/assets/js/vendor/usero-sdk.iife.js` for this reason.
   - Nonce + capability checks on every admin action and AJAX endpoint
   - Output escaping (`esc_html`, `esc_attr`, `esc_url`)
   - Input sanitization on every option write
   - Prefixed globals, functions, constants, options (`usero_*`, `Usero_*`,
     `USERO_*`)
   - External services documented in the `== External services ==` section
     of `readme.txt`
   - `Tested up to:` matches a real recent WP release (we ship 6.5)
3. Expected timeline: 1 to 14 days for initial review. Reviewer replies via
   plugins@wordpress.org with required changes; reply on that thread with a
   new zip. Once approved you get SVN access at
   `https://plugins.svn.wordpress.org/usero/` and the listing goes live.

## Manual SVN fallback

Only use this if GitHub Actions is unavailable.

```bash
# First time only:
svn co https://plugins.svn.wordpress.org/usero ~/svn/usero

# Each release:
cd ~/svn/usero
rsync -av --delete \
  --exclude='.git*' --exclude='node_modules' --exclude='dev-artifacts' \
  --exclude='RELEASE.md' --exclude='SMOKE.md' \
  ~/projects/usero/wordpress/ trunk/
svn cp trunk tags/X.Y.Z
svn add --force trunk tags/X.Y.Z
svn st | grep '^!' | awk '{print $2}' | xargs -r svn rm
svn ci -m "Release X.Y.Z"
```
