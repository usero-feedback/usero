# Smoke testing the Usero WordPress plugin

Three options for an end-to-end test before submitting to WordPress.org. Native PHP plus SQLite is the lightest path and what is recommended day to day. Docker stays as a fallback if you want to mirror the wordpress.org reviewer environment more closely.

## Option A: Native PHP plus SQLite (recommended)

No MySQL, no Docker. Uses the official "SQLite Database Integration" plugin so WordPress runs against a local file. Takes about 60 seconds end to end.

```bash
# 1. Install PHP if missing (already includes pdo_sqlite + sqlite3 extensions).
brew install php

# 2. Working dir + latest WordPress.
mkdir -p /tmp/usero-wp-smoke && cd /tmp/usero-wp-smoke
curl -sL https://wordpress.org/latest.tar.gz | tar xz
WP=/tmp/usero-wp-smoke/wordpress

# 3. Symlink the plugin so edits in this repo are live.
ln -sfn "$HOME/projects/usero/wordpress" "$WP/wp-content/plugins/usero"

# 4. Install the SQLite drop-in. db.copy must be placed at wp-content/db.php
#    BEFORE running the WP installer, otherwise WP tries MySQL and dies.
curl -sL https://downloads.wordpress.org/plugin/sqlite-database-integration.zip -o /tmp/sqlite-db.zip
unzip -q /tmp/sqlite-db.zip -d "$WP/wp-content/plugins/"
cp "$WP/wp-content/plugins/sqlite-database-integration/db.copy" "$WP/wp-content/db.php"

# 5. Create wp-config.php. Fetch fresh salts from api.wordpress.org and paste
#    them into the AUTH_KEY etc. block. DB_* values are required by core but
#    ignored by the SQLite drop-in. Add the Usero backend override at the end:
#
#      define( 'WP_DEBUG', true );
#      define( 'WP_DEBUG_LOG', true );
#      define( 'WP_DEBUG_DISPLAY', false );
#      define( 'USERO_API_BASE', 'https://feedback-preview.willsmithte.workers.dev' );
#
#    (Swap in http://localhost:5223 if you want to point at a local Workers
#    dev server. No host.docker.internal needed here, since the PHP server
#    runs on the host.)

# 6. Boot the built-in PHP server. Pick any free port.
cd "$WP" && php -S localhost:8080 -t . &
PHP_PID=$!

# 7. Open http://localhost:8080/wp-admin/install.php and complete the
#    standard WP install wizard (about 30 seconds, three fields).
```

Then:

1. In wp-admin, activate "Usero" from the Plugins screen.
2. You should be redirected to Settings, Usero.
3. Click `Connect with admin@yoursite.com`.
4. Watch the inbox for the magic-link, click it.
5. The plugin should auto-update to the connected state within about 2 seconds.
6. Reload the front page. Widget should appear in the bottom-right corner.

When done, kill the server with `kill $PHP_PID`. The SQLite DB lives at `$WP/wp-content/database/.ht.sqlite` and is wiped by deleting `/tmp/usero-wp-smoke`.

## Option B: Docker (heavier alternative)

Use this if you want the reviewer-style Apache plus MySQL stack, or if `brew install php` is blocked.

```bash
# From this directory:
docker run --rm -d --name usero-wp -p 8080:80 \
  -v "$(pwd)":/var/www/html/wp-content/plugins/usero \
  wordpress:6.5-php8.2-apache
```

Browse to <http://localhost:8080>, complete the WP install wizard, then follow the same six activation steps as Option A.

If pointing at a non-prod Usero backend, add this to `wp-config.php` inside the container:

```php
define( 'USERO_API_BASE', 'http://host.docker.internal:5223' );
```

(Use `host.docker.internal` so the container can reach the Workers dev server on the host's port.)

## Option C: Contract-level smoke without WP

The plugin only talks to the Usero backend via two POSTs and one GET. Both contracts are exercised by the curl transcript in the parent repo's commit message for `wp-plugin backend: ...` and can be re-run any time:

```bash
# Set up a fake site that emits the verification meta tag
node /tmp/fake-wp-site.mjs FAKE_TOKEN_AAAAAAAAAAAAAAAA 9999 &

# 1) start handshake
curl -s -X POST http://localhost:5223/api/wp/connect \
  -H 'Content-Type: application/json' \
  -d '{"siteUrl":"http://localhost:9999/","adminEmail":"you@example.com","siteToken":"FAKE_TOKEN_AAAAAAAAAAAAAAAA"}'

# (open the link printed in the dev server log, since EMAIL is skipped in
#  non-prod environments)

# 2) poll until confirmed -> get clientId + writeKey
curl -s "http://localhost:5223/api/wp/handshake/status?token=<TOKEN>"
```

If those two return as expected, the plugin's network code (which is just `wp_remote_post` wrapping the same JSON) will work end-to-end inside a real WP install. The first-feedback "aha" is now driven by the dashboard's empty-state CTA opening the user's site so they can click their own widget, not a server-side seed.

## Pre-submit checklist

- [ ] Open every settings tab in the connected state and confirm no PHP notices in `wp-content/debug.log` (`define( 'WP_DEBUG', true )` first).
- [ ] Deactivate, reactivate: confirm the connection persists (no re-handshake required) and the redirect to the settings page fires once.
- [ ] Uninstall: confirm every `usero_*` option is gone from `wp_options`.
- [ ] Open the front page in a fresh browser session: the widget loads and clicking it submits feedback that lands in the connected client's inbox on usero.io.
