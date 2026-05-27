<?php
/**
 * Front-end widget injection + the per-install <meta> verification tag.
 *
 * Pre-connect: we still emit the meta tag (so the handshake can verify) but
 * not the widget script. The design doc's "admin preview" mode is deferred
 * to v1.1 because it requires a widget change (admin-only cookie sniff).
 *
 * Post-connect: load the vanilla @usero/sdk script asynchronously with the
 * site's clientId. Gated on the "enabled" setting.
 *
 * @package Usero
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Usero_Widget {

	public static function register() {
		add_action( 'wp_head', array( __CLASS__, 'render_meta' ), 1 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_widget' ) );

		add_shortcode( 'usero_widget', array( __CLASS__, 'shortcode' ) );
	}

	public static function render_meta() {
		$token = get_option( Usero_Plugin::OPT_SITE_TOKEN );
		if ( ! $token ) {
			return;
		}
		echo '<meta name="usero-site-verify" content="' . esc_attr( $token ) . '">' . "\n";
	}

	public static function enqueue_widget() {
		if ( ! Usero_Plugin::is_connected() ) {
			return;
		}
		$settings = get_option( Usero_Plugin::OPT_SETTINGS, array() );
		if ( empty( $settings['enabled'] ) ) {
			return;
		}

		$client_id = get_option( Usero_Plugin::OPT_CLIENT_ID );
		if ( ! $client_id ) {
			return;
		}

		// Vanilla embed script. The @usero/sdk reads window.useroConfig (and
		// data-* on the script tag) for clientId/position/accent. The SDK is
		// vendored locally (WP.org disallows remote-hosted scripts); bump
		// USERO_SDK_VERSION in usero.php when replacing the vendored file.
		wp_enqueue_script(
			'usero-sdk',
			USERO_PLUGIN_URL . 'assets/js/vendor/usero-sdk.iife.js',
			array(),
			USERO_SDK_VERSION,
			true
		);

		$config = array(
			'clientId' => (string) $client_id,
			'position' => isset( $settings['position'] ) ? (string) $settings['position'] : 'right',
			'theme'    => array(
				'primary' => isset( $settings['accent_color'] ) ? (string) $settings['accent_color'] : '#7B5BFF',
			),
		);

		wp_add_inline_script(
			'usero-sdk',
			'window.useroConfig = ' . wp_json_encode( $config ) . ';',
			'before'
		);

		// The vendored SDK exposes window.Usero.initUseroFeedbackWidget but does
		// not auto-init from window.useroConfig. Call it explicitly once the
		// script has loaded.
		wp_add_inline_script(
			'usero-sdk',
			'if (window.Usero && typeof window.Usero.initUseroFeedbackWidget === "function") { window.Usero.initUseroFeedbackWidget(window.useroConfig); }',
			'after'
		);
	}

	public static function shortcode( $atts ) {
		$atts = shortcode_atts( array( 'inline' => '0' ), $atts, 'usero_widget' );
		if ( ! Usero_Plugin::is_connected() ) {
			return '';
		}
		$client_id = esc_attr( (string) get_option( Usero_Plugin::OPT_CLIENT_ID ) );
		return '<div class="usero-inline-widget" data-usero-client-id="' . $client_id . '"></div>';
	}
}
