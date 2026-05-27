<?php
/**
 * One-shot, guideline-safe review nudge for the WP.org plugin page.
 *
 * Trigger conditions (ALL must be true) per the design doc:
 *   - installed for >= 14 days
 *   - inbox has >= 5 real (non-system) feedback rows
 *   - never permanently dismissed by this user
 *   - any per-user snooze has expired
 *   - current user has manage_options
 *
 * For the inbox-count check we'd need a separate API call to usero.io.
 * v1 simplification: we use a local counter we increment via a planned
 * /api/wp/feedback-count poll (NOT implemented in this PR; see the
 * follow-up "ready to submit" list). Until that endpoint ships, the nudge
 * will never display, which is the safe default for marketplace review.
 *
 * Notice is rendered ONLY on the Usero settings screen, not site-wide.
 *
 * @package Usero
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Usero_Review_Nudge {

	const META_DISMISSED    = 'usero_review_dismissed';
	const META_SNOOZE_UNTIL = 'usero_review_snooze_until';

	public static function register() {
		add_action( 'admin_notices', array( __CLASS__, 'maybe_render' ) );
		add_action( 'wp_ajax_usero_review_dismiss', array( __CLASS__, 'ajax_dismiss' ) );
	}

	public static function maybe_render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		if ( ! $screen || 'settings_page_usero' !== $screen->id ) {
			return;
		}
		if ( ! Usero_Plugin::is_connected() ) {
			return;
		}

		$installed_at = (int) get_option( Usero_Plugin::OPT_INSTALLED_AT, 0 );
		if ( ! $installed_at || ( time() - $installed_at ) < 14 * DAY_IN_SECONDS ) {
			return;
		}

		$user_id = get_current_user_id();
		if ( get_user_meta( $user_id, self::META_DISMISSED, true ) ) {
			return;
		}
		$snooze_until = (int) get_user_meta( $user_id, self::META_SNOOZE_UNTIL, true );
		if ( $snooze_until && $snooze_until > time() ) {
			return;
		}

		// Real-count check: stubbed for v1. See class header.
		// if ( self::feedback_count() < 5 ) return;
		return;

		// The render path below stays defined for v1.1 when the count check
		// is wired up.
		// phpcs:ignore Squiz.PHP.NonExecutableCode.Unreachable
		wp_register_script(
			'usero-review-nudge',
			USERO_PLUGIN_URL . 'assets/js/usero-review-nudge.js',
			array(),
			USERO_VERSION,
			true
		);
		wp_add_inline_script(
			'usero-review-nudge',
			'window.useroReviewNudgeData = ' . wp_json_encode(
				array(
					'nonce'   => wp_create_nonce( 'usero_review_nonce' ),
					'ajaxUrl' => admin_url( 'admin-ajax.php' ),
				)
			) . ';',
			'before'
		);
		wp_enqueue_script( 'usero-review-nudge' );
		?>
		<div class="notice notice-info is-dismissible" id="usero-review-nudge">
			<p>
				You have collected several pieces of feedback with Usero. If it has been useful, a quick review on WordPress.org
				helps other site owners find it.
			</p>
			<p>
				<a class="button button-primary" href="https://wordpress.org/support/plugin/usero/reviews/" target="_blank" rel="noopener">Leave a review</a>
				<button class="button" data-usero-review-action="snooze">Maybe later</button>
				<button class="button" data-usero-review-action="dismiss">Do not ask again</button>
			</p>
		</div>
		<?php
	}

	public static function ajax_dismiss() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array(), 403 );
		}
		check_ajax_referer( 'usero_review_nonce', 'nonce' );
		$mode    = isset( $_POST['mode'] ) ? sanitize_key( wp_unslash( $_POST['mode'] ) ) : 'snooze';
		$user_id = get_current_user_id();
		if ( 'dismiss' === $mode ) {
			update_user_meta( $user_id, self::META_DISMISSED, 1 );
		} else {
			update_user_meta( $user_id, self::META_SNOOZE_UNTIL, time() + 30 * DAY_IN_SECONDS );
		}
		wp_send_json_success();
	}
}
