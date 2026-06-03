=== Usero ===
Contributors: userohq
Tags: feedback, feature-requests, roadmap, bug-tracker, widget
Requires at least: 5.8
Tested up to: 6.5
Requires PHP: 7.4
Stable tag: 1.1.9
License: GPL-2.0-or-later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Feedback widget for WordPress. Collect ideas, bugs, and feature requests in one inbox, with a public roadmap and GitHub sync.

== Description ==

Usero adds a feedback widget to your WordPress site. Visitors can submit ideas, bug reports, and feature requests without leaving the page. Submissions appear in a dashboard at usero.io, where you can triage, reply, and update statuses.

= Features =

* Floating widget on every page, or inline via shortcode `[usero_widget]` or `<div class="usero-inline-widget"></div>`
* One inbox for incoming feedback, with search and filters
* Public roadmap page (optional) so visitors can see what is planned
* Voting, comments, and status updates
* GitHub issue sync
* Email notifications when feedback comes in
* Configurable widget position and accent color
* Works with any theme, no theme code edits required

= How it works =

1. Install and activate the plugin.
2. Open Settings, Usero, and click Create my free account. The plugin creates a free account on usero.io (or logs into your existing one) using your admin email and a magic link.
3. The widget appears on the front end. Submissions land in your usero.io dashboard.

The plugin requires a connected usero.io account because feedback, voting, and the roadmap page are served from usero.io. A self-hosted version is not currently available.

== Installation ==

1. Install the plugin from the WordPress.org directory, or upload the zip via Plugins, Add New, Upload Plugin.
2. Activate the plugin. You will be redirected to Settings, Usero.
3. Click Create my free account using your admin email and open the magic link in the email that is sent.
4. The widget appears on the front end automatically. Use the shortcode `[usero_widget]` for inline placement.

== Frequently Asked Questions ==

= Does the widget slow down my site? =

The widget script loads asynchronously after page render. It is roughly 30KB gzipped.

= Where is my feedback data stored? =

In your usero.io account. For EU-region storage, email support@usero.io and we will enable EU data residency on your client.

= Can I self-host? =

Not currently. The plugin connects to usero.io.

= Do I need to create an account on usero.io first? =

No. The plugin creates the account for you when you click Create my free account. You confirm the magic link in your email.

= How do I remove the widget without uninstalling? =

In Settings, Usero, uncheck "Show the widget on the front end."

== Screenshots ==

1. The widget open on a real site, ready for feedback
2. The inbox dashboard with feedback trends and metrics
3. A feedback item with one-click "Create Pull Request" action
4. Session replay list, showing recorded visitor sessions
5. The empty inbox after first install, with quick-start actions

== External services ==

This plugin connects to one external service: the Usero API at usero.io. The widget runtime is bundled inside the plugin and is not loaded from a third-party CDN.

= Usero API (usero.io) =

The plugin connects to the Usero API at usero.io for the connection handshake, to load your dashboard, and to receive submitted feedback.

It sends the following data:

* During the initial connect handshake (`POST https://usero.io/api/wp/connect`): your site URL, the admin email entered in the connect form, and a per-install site verification token.
* While the connect handshake is pending (`GET https://usero.io/api/wp/handshake/status?token=...`): the handshake token issued in the previous step. This is polled every two seconds until the admin clicks the magic link or the handshake expires.

After connection, the widget script (bundled inside this plugin) submits feedback directly from the visitor's browser to usero.io. The plugin itself does not send visitor data from the server.

This service is provided by Usero, Inc.:

* Terms of Service: https://usero.io/terms
* Privacy Policy: https://usero.io/privacy

== Changelog ==

= 1.1.5 =
* Update the bundled @usero/sdk widget runtime to v1.1.5, including session replay and user-test improvements from recent SDK releases. The plugin version now tracks the bundled SDK version.

= 1.0.3 =
* Rewrite the Pro tab feature list to accurately describe what Pro includes. Removed the "Powered by Usero badge" line (the plugin does not inject any front-end attribution) and trimmed integrations to those actually shipped.

= 1.0.2 =
* Bundle the @usero/sdk widget runtime inside the plugin instead of loading it from a third-party CDN, per Plugin Check guidance.
* Escape all dynamic URL output in the settings screen (`esc_url` on href attributes).
* Add nonce-verification documentation comments to AJAX handlers (nonces were already verified in a shared guard helper that the static analyzer could not trace).
* Prefix global variables in `uninstall.php` to avoid namespace collisions.

= 1.0.1 =
* Move all admin JavaScript to enqueued script files (no more inline `<script>` tags in admin pages).
* Add External Services section to readme documenting outbound calls to usero.io and the jsDelivr CDN.
* Rewrite plugin description to be purely factual (removed competitor comparisons and pricing claims).

= 1.0.0 =
* First release.

== Upgrade Notice ==

= 1.1.5 =
Updates the bundled widget runtime to @usero/sdk v1.1.5. Recommended for all users.

= 1.0.3 =
Removes a misleading "Powered by Usero badge" line from the Pro tab. No functional changes.

= 1.0.2 =
Bundles the widget runtime in-plugin so installs no longer load a third-party CDN. Recommended for all users.

= 1.0.1 =
Moves admin JS out of inline tags. No action required.

= 1.0.0 =
First release.
