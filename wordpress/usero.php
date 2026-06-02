<?php
/**
 * Plugin Name:       Usero
 * Plugin URI:        https://usero.io/wordpress
 * Description:       Free feedback widget for WordPress. One inbox for ideas, bugs, and feature requests, with public roadmap and GitHub sync. No per-user fees.
 * Version:           1.0.3
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * Author:            Usero
 * Author URI:        https://usero.io
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       usero
 *
 * @package Usero
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'USERO_VERSION', '1.0.3' );
// Version of the vendored @usero/sdk widget runtime in assets/js/vendor/usero-sdk.iife.js.
// Bump when you replace the vendored file with a newer SDK build.
define( 'USERO_SDK_VERSION', '1.1.3' );
define( 'USERO_PLUGIN_FILE', __FILE__ );
define( 'USERO_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'USERO_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

// Usero API base. Overridable via wp-config.php for staging:
//   define( 'USERO_API_BASE', 'https://feedback-preview.willsmithte.workers.dev' );
if ( ! defined( 'USERO_API_BASE' ) ) {
	define( 'USERO_API_BASE', 'https://usero.io' );
}

require_once USERO_PLUGIN_DIR . 'includes/class-usero-plugin.php';
require_once USERO_PLUGIN_DIR . 'includes/class-usero-connect.php';
require_once USERO_PLUGIN_DIR . 'includes/class-usero-settings.php';
require_once USERO_PLUGIN_DIR . 'includes/class-usero-widget.php';
require_once USERO_PLUGIN_DIR . 'includes/class-usero-review-nudge.php';

register_activation_hook( __FILE__, array( 'Usero_Plugin', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'Usero_Plugin', 'deactivate' ) );

add_action( 'plugins_loaded', array( 'Usero_Plugin', 'boot' ) );
