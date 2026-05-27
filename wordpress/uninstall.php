<?php
/**
 * Uninstall: drop every usero_* option this plugin created.
 *
 * Runs only on true uninstall, not deactivate. We do NOT call back to usero.io
 * to notify of disconnect: it would block the uninstall on a network call,
 * the data lives on the user's account either way, and many WP installs
 * uninstall plugins while offline.
 *
 * @package Usero
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

$usero_options = array(
	'usero_site_token',
	'usero_client_id',
	'usero_write_key',
	'usero_connected_email',
	'usero_installed_at',
	'usero_review_nudge_dismissed',
	'usero_review_nudge_snooze_until',
	'usero_settings',
);
foreach ( $usero_options as $usero_opt ) {
	delete_option( $usero_opt );
	if ( is_multisite() ) {
		delete_site_option( $usero_opt );
	}
}

// Per-user dismissal markers.
delete_metadata( 'user', 0, 'usero_review_dismissed', '', true );
delete_metadata( 'user', 0, 'usero_review_snooze_until', '', true );
