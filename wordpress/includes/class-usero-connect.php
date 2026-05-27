<?php
/**
 * Usero connect handshake.
 *
 * Two admin-ajax endpoints:
 *   - usero_connect_start: POSTs to /api/wp/connect on usero.io with the
 *     site URL, admin email, and the per-install siteToken (also emitted as
 *     a <meta> tag by Usero_Widget). Receives a handshakeToken.
 *   - usero_connect_poll: GETs /api/wp/handshake/status?token=...; once the
 *     admin clicks the magic-link, the response carries clientId + writeKey,
 *     which we persist. The dashboard's empty state then guides the user to
 *     open their site and submit a real test piece via the widget.
 *
 * @package Usero
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Usero_Connect {

	const NONCE_ACTION = 'usero_connect_nonce';

	public static function register() {
		add_action( 'wp_ajax_usero_connect_start', array( __CLASS__, 'ajax_start' ) );
		add_action( 'wp_ajax_usero_connect_poll', array( __CLASS__, 'ajax_poll' ) );
		add_action( 'wp_ajax_usero_disconnect', array( __CLASS__, 'ajax_disconnect' ) );
	}

	public static function ajax_start() {
		self::guard();

		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is verified in self::guard() above via check_ajax_referer().
		$email = isset( $_POST['email'] ) ? sanitize_email( wp_unslash( $_POST['email'] ) ) : '';
		if ( ! is_email( $email ) ) {
			wp_send_json_error( array( 'message' => 'Invalid email address.' ), 400 );
		}

		$site_url   = home_url( '/' );
		$site_token = get_option( Usero_Plugin::OPT_SITE_TOKEN );
		if ( ! $site_token ) {
			// Belt and braces: if the activation hook was skipped (e.g.
			// dropped-in upload), mint one now.
			$site_token = wp_generate_password( 32, false, false );
			update_option( Usero_Plugin::OPT_SITE_TOKEN, $site_token, false );
		}

		$response = wp_remote_post(
			trailingslashit( USERO_API_BASE ) . 'api/wp/connect',
			array(
				'timeout' => 20,
				'headers' => array( 'Content-Type' => 'application/json' ),
				'body'    => wp_json_encode(
					array(
						'siteUrl'    => $site_url,
						'adminEmail' => $email,
						'siteToken'  => $site_token,
					)
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			wp_send_json_error( array( 'message' => 'Could not reach usero.io: ' . $response->get_error_message() ), 502 );
		}

		$code = wp_remote_retrieve_response_code( $response );
		$body = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( $code >= 400 || ! is_array( $body ) ) {
			$msg = is_array( $body ) && isset( $body['error'] ) ? $body['error'] : 'Unknown error';
			wp_send_json_error( array( 'message' => $msg, 'code' => $code ), 502 );
		}

		if ( empty( $body['handshakeToken'] ) ) {
			wp_send_json_error( array( 'message' => 'Server did not return a handshake token.' ), 502 );
		}

		wp_send_json_success(
			array(
				'handshakeToken' => $body['handshakeToken'],
				'expiresAt'      => isset( $body['expiresAt'] ) ? $body['expiresAt'] : null,
				'email'          => $email,
			)
		);
	}

	public static function ajax_poll() {
		self::guard();

		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- Nonce is verified in self::guard() above via check_ajax_referer().
		$token = isset( $_POST['handshakeToken'] ) ? sanitize_text_field( wp_unslash( $_POST['handshakeToken'] ) ) : '';
		if ( '' === $token ) {
			wp_send_json_error( array( 'message' => 'Missing handshakeToken.' ), 400 );
		}

		$response = wp_remote_get(
			trailingslashit( USERO_API_BASE ) . 'api/wp/handshake/status?token=' . rawurlencode( $token ),
			array( 'timeout' => 10 )
		);

		if ( is_wp_error( $response ) ) {
			wp_send_json_error( array( 'message' => $response->get_error_message() ), 502 );
		}

		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $body ) ) {
			wp_send_json_error( array( 'message' => 'Bad response from usero.io.' ), 502 );
		}

		$status = isset( $body['status'] ) ? $body['status'] : 'unknown';

		if ( 'confirmed' === $status && ! empty( $body['clientId'] ) && ! empty( $body['writeKey'] ) ) {
			update_option( Usero_Plugin::OPT_CLIENT_ID, sanitize_text_field( $body['clientId'] ), false );
			update_option( Usero_Plugin::OPT_WRITE_KEY, sanitize_text_field( $body['writeKey'] ), false );
			if ( ! empty( $body['adminEmail'] ) ) {
				update_option( Usero_Plugin::OPT_CONNECTED_EMAIL, sanitize_email( $body['adminEmail'] ), false );
			}

			wp_send_json_success(
				array(
					'status'    => 'confirmed',
					'clientId'  => $body['clientId'],
					'dashboard' => isset( $body['dashboardUrl'] ) ? esc_url_raw( $body['dashboardUrl'] ) : USERO_API_BASE,
				)
			);
		}

		wp_send_json_success( array( 'status' => $status ) );
	}

	public static function ajax_disconnect() {
		self::guard();

		delete_option( Usero_Plugin::OPT_CLIENT_ID );
		delete_option( Usero_Plugin::OPT_WRITE_KEY );
		delete_option( Usero_Plugin::OPT_CONNECTED_EMAIL );

		wp_send_json_success( array( 'disconnected' => true ) );
	}

	private static function guard() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => 'Insufficient permissions.' ), 403 );
		}
		check_ajax_referer( self::NONCE_ACTION, 'nonce' );
	}

}
