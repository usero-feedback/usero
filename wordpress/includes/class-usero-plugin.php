<?php
/**
 * Bootstrap singleton for the Usero plugin.
 *
 * Responsibilities:
 *   - Activation: mint the per-install site verification token and set the
 *     one-shot redirect transient (skipped for network activations).
 *   - Boot: register every other class's hooks. Keeps the main plugin file
 *     readable and lets us add/remove subsystems without editing it.
 *
 * @package Usero
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Usero_Plugin {

	const OPT_SITE_TOKEN          = 'usero_site_token';
	const OPT_CLIENT_ID           = 'usero_client_id';
	const OPT_WRITE_KEY           = 'usero_write_key';
	const OPT_CONNECTED_EMAIL     = 'usero_connected_email';
	const OPT_INSTALLED_AT        = 'usero_installed_at';
	const OPT_REVIEW_DISMISSED    = 'usero_review_nudge_dismissed';
	const OPT_REVIEW_SNOOZE_UNTIL = 'usero_review_nudge_snooze_until';

	const OPT_SETTINGS = 'usero_settings';

	const TRANSIENT_REDIRECT = 'usero_redirect_after_activate';

	public static function boot() {
		Usero_Settings::register();
		Usero_Widget::register();
		Usero_Connect::register();
		Usero_Review_Nudge::register();

		add_action( 'admin_init', array( __CLASS__, 'maybe_redirect_after_activate' ) );
	}

	public static function activate() {
		// Per-install verification token. Emitted as a <meta> tag so the Usero
		// backend can confirm we control the site before issuing a writeKey.
		if ( ! get_option( self::OPT_SITE_TOKEN ) ) {
			update_option( self::OPT_SITE_TOKEN, wp_generate_password( 32, false, false ), false );
		}
		if ( ! get_option( self::OPT_INSTALLED_AT ) ) {
			update_option( self::OPT_INSTALLED_AT, time(), false );
		}
		if ( ! get_option( self::OPT_SETTINGS ) ) {
			update_option(
				self::OPT_SETTINGS,
				array(
					'enabled'      => 1,
					'position'     => 'right',
					'accent_color' => '#7B5BFF',
				),
				false
			);
		}

		// One-shot redirect to the welcome screen. Skipped on multisite network
		// activation, where 200 simultaneous redirects would be hostile.
		if ( ! ( is_multisite() && is_network_admin() ) ) {
			set_transient( self::TRANSIENT_REDIRECT, 1, 30 );
		}
	}

	public static function deactivate() {
		delete_transient( self::TRANSIENT_REDIRECT );
		// We intentionally leave the connected credentials in place on
		// deactivate so re-activate doesn't force them through the connect
		// dance again. Full cleanup lives in uninstall.php.
	}

	public static function maybe_redirect_after_activate() {
		if ( ! get_transient( self::TRANSIENT_REDIRECT ) ) {
			return;
		}
		delete_transient( self::TRANSIENT_REDIRECT );

		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		if ( wp_doing_ajax() || ( defined( 'DOING_CRON' ) && DOING_CRON ) ) {
			return;
		}
		wp_safe_redirect( admin_url( 'options-general.php?page=usero' ) );
		exit;
	}

	public static function is_connected() {
		return (bool) get_option( self::OPT_CLIENT_ID ) && (bool) get_option( self::OPT_WRITE_KEY );
	}
}
