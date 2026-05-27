<?php
/**
 * Settings > Usero admin page.
 *
 * Two render states:
 *   - Not connected: welcome screen, lead with the outcome, one primary CTA.
 *   - Connected: live status checklist + one conditional primary CTA, followed
 *     by Settings / Pages / Advanced / Pro tabs.
 *
 * Uses the WP Settings API for persistence (no custom POST handler).
 *
 * @package Usero
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Usero_Settings {

	const PAGE_SLUG               = 'usero';
	const OPT_GROUP               = 'usero_settings_group';
	const TRANSIENT_WIDGET_DETECT = 'usero_widget_detect';

	public static function register() {
		add_action( 'admin_menu', array( __CLASS__, 'add_menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_assets' ) );
	}

	public static function add_menu() {
		add_options_page(
			'Usero',
			'Usero',
			'manage_options',
			self::PAGE_SLUG,
			array( __CLASS__, 'render_page' )
		);
	}

	public static function register_settings() {
		register_setting(
			self::OPT_GROUP,
			Usero_Plugin::OPT_SETTINGS,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( __CLASS__, 'sanitize_settings' ),
				'default'           => array(
					'enabled'      => 1,
					'position'     => 'right',
					'accent_color' => '#7B5BFF',
				),
			)
		);
	}

	public static function sanitize_settings( $value ) {
		$out                 = array();
		$out['enabled']      = ! empty( $value['enabled'] ) ? 1 : 0;
		$position            = isset( $value['position'] ) ? (string) $value['position'] : 'right';
		$allowed_positions   = array( 'right', 'left' );
		$out['position']     = in_array( $position, $allowed_positions, true ) ? $position : 'right';
		$out['accent_color'] = sanitize_hex_color( isset( $value['accent_color'] ) ? $value['accent_color'] : '' );
		if ( ! $out['accent_color'] ) {
			$out['accent_color'] = '#7B5BFF';
		}
		// Cached widget-detect check is now stale after a settings save.
		delete_transient( self::TRANSIENT_WIDGET_DETECT );
		return $out;
	}

	public static function enqueue_assets( $hook ) {
		if ( 'settings_page_' . self::PAGE_SLUG !== $hook ) {
			return;
		}

		wp_enqueue_style(
			'usero-admin',
			USERO_PLUGIN_URL . 'assets/css/admin.css',
			array(),
			USERO_VERSION
		);

		$nonce    = wp_create_nonce( Usero_Connect::NONCE_ACTION );
		$ajax_url = admin_url( 'admin-ajax.php' );

		if ( ! Usero_Plugin::is_connected() ) {
			wp_register_script(
				'usero-connect',
				USERO_PLUGIN_URL . 'assets/js/usero-connect.js',
				array(),
				USERO_VERSION,
				true
			);
			wp_add_inline_script(
				'usero-connect',
				'window.useroConnectData = ' . wp_json_encode(
					array(
						'nonce'   => $nonce,
						'ajaxUrl' => $ajax_url,
					)
				) . ';',
				'before'
			);
			wp_enqueue_script( 'usero-connect' );
			return;
		}

		wp_register_script(
			'usero-disconnect',
			USERO_PLUGIN_URL . 'assets/js/usero-disconnect.js',
			array(),
			USERO_VERSION,
			true
		);
		wp_add_inline_script(
			'usero-disconnect',
			'window.useroDisconnectData = ' . wp_json_encode(
				array(
					'nonce'   => $nonce,
					'ajaxUrl' => $ajax_url,
				)
			) . ';',
			'before'
		);
		wp_enqueue_script( 'usero-disconnect' );

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Display-only tab selector.
		$tab = isset( $_GET['tab'] ) ? sanitize_key( wp_unslash( $_GET['tab'] ) ) : 'settings';

		if ( 'settings' === $tab ) {
			wp_enqueue_style( 'wp-color-picker' );
			wp_enqueue_script(
				'usero-admin-preview',
				USERO_PLUGIN_URL . 'assets/js/usero-admin-preview.js',
				array( 'wp-color-picker' ),
				USERO_VERSION,
				true
			);
		}

		// QR library + small render shim, used on the connected dashboard.
		if ( in_array( $tab, array( 'settings' ), true ) ) {
			wp_register_script(
				'usero-qrcode',
				USERO_PLUGIN_URL . 'assets/js/vendor/qrcode.min.js',
				array(),
				'1.0.0',
				true
			);
			wp_enqueue_script(
				'usero-qr',
				USERO_PLUGIN_URL . 'assets/js/usero-qr.js',
				array( 'usero-qrcode' ),
				USERO_VERSION,
				true
			);
		}
	}

	public static function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( 'Insufficient permissions.' );
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Read-only tab selector.
		$tab = isset( $_GET['tab'] ) ? sanitize_key( wp_unslash( $_GET['tab'] ) ) : 'settings';

		echo '<div class="wrap usero-admin">';
		echo '<h1>Usero</h1>';

		if ( ! Usero_Plugin::is_connected() ) {
			self::render_connect_screen();
			echo '</div>';
			return;
		}

		self::render_tabs( $tab );

		switch ( $tab ) {
			case 'pages':
				self::render_pages_tab();
				break;
			case 'advanced':
				self::render_advanced_tab();
				break;
			case 'pro':
				self::render_pro_tab();
				break;
			default:
				self::render_post_connect_header();
				self::render_settings_tab();
		}

		echo '</div>';
	}

	/**
	 * Detect whether the public homepage exposes the usero-site-verify meta tag.
	 * Cached for 5 minutes via transient so we don't hit the home URL on every page load.
	 *
	 * @return array{status:string,detail:string}
	 */
	private static function detect_widget_on_homepage() {
		$cached = get_transient( self::TRANSIENT_WIDGET_DETECT );
		if ( is_array( $cached ) && isset( $cached['status'] ) ) {
			return $cached;
		}

		$response = wp_remote_get(
			home_url( '/' ),
			array(
				'timeout'    => 4,
				'user-agent' => 'Usero-WP/' . USERO_VERSION . ' (verify)',
			)
		);

		if ( is_wp_error( $response ) ) {
			$result = array( 'status' => 'unknown', 'detail' => 'Could not reach the homepage to verify.' );
		} else {
			$body  = (string) wp_remote_retrieve_body( $response );
			$found = ( false !== strpos( $body, 'name="usero-site-verify"' ) )
				|| ( false !== strpos( $body, "name='usero-site-verify'" ) );
			$result = $found
				? array( 'status' => 'ok', 'detail' => 'Verification tag found on your homepage.' )
				: array( 'status' => 'missing', 'detail' => 'Widget tag not detected. Clear caches and reload your homepage.' );
		}

		set_transient( self::TRANSIENT_WIDGET_DETECT, $result, 5 * MINUTE_IN_SECONDS );
		return $result;
	}

	private static function render_connect_screen() {
		$default_email = wp_get_current_user()->user_email;
		if ( ! is_email( $default_email ) ) {
			$default_email = get_option( 'admin_email' );
		}
		?>
		<div class="usero-connect">
			<p class="usero-connect__lead">
				Collect bugs, ideas, and feature requests from your visitors in one inbox.
			</p>

			<ul class="usero-benefits">
				<li><span class="dashicons dashicons-email-alt"></span> One shared inbox</li>
				<li><span class="dashicons dashicons-list-view"></span> Public roadmap</li>
				<li><span class="dashicons dashicons-heart"></span> Free forever</li>
			</ul>

			<div class="usero-connect__row">
				<div class="usero-connect__field">
					<label for="usero-connect-email">Use this email, or change it</label>
					<input type="email" id="usero-connect-email" class="regular-text"
						value="<?php echo esc_attr( $default_email ); ?>" />
				</div>
				<div>
					<button type="button" id="usero-connect-button" class="button button-primary button-large">
						Create my free account
					</button>
				</div>
			</div>

			<p id="usero-connect-status" class="usero-connect__status" role="status" aria-live="polite"></p>

			<div class="usero-connect__preview">
				<p class="usero-connect__preview-label">What your visitors will see</p>
				<?php self::render_mock_site(); ?>
			</div>

			<details class="usero-existing">
				<summary>Have an existing Usero account?</summary>
				<div class="usero-existing__body">
					Use the email you signed up with above and click <strong>Create my free account</strong>. We will recognise you and log into your existing one with a magic link instead of creating a new account.
				</div>
			</details>
		</div>

		<?php
		// Hidden mirrors so the connect JS keeps working unchanged.
		?>
		<span id="usero-connect-email-label" hidden></span>
		<span id="usero-connect-email-display" hidden></span>
		<?php
	}

	private static function render_mock_site() {
		?>
		<div class="usero-mock-site" aria-hidden="true">
			<div class="usero-mock-site__chrome"><span></span><span></span><span></span></div>
			<div class="usero-mock-site__bubble">
				<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M4 5h16v10H8l-4 4V5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
				</svg>
			</div>
		</div>
		<?php
	}

	private static function render_tabs( $current ) {
		$tabs = array(
			'settings' => 'Settings',
			'pages'    => 'Pages',
			'advanced' => 'Advanced',
			'pro'      => 'Pro',
		);
		echo '<h2 class="nav-tab-wrapper">';
		foreach ( $tabs as $slug => $label ) {
			$url    = add_query_arg( array( 'page' => self::PAGE_SLUG, 'tab' => $slug ), admin_url( 'options-general.php' ) );
			$active = $current === $slug;
			$class  = 'nav-tab' . ( $active ? ' nav-tab-active' : '' );
			$aria   = $active ? ' aria-current="page"' : '';
			echo '<a href="' . esc_url( $url ) . '" class="' . esc_attr( $class ) . '"' . $aria . '>' . esc_html( $label ) . '</a>';
		}
		echo '</h2>';
	}

	private static function render_post_connect_header() {
		$email      = (string) get_option( Usero_Plugin::OPT_CONNECTED_EMAIL );
		$client_id  = (string) get_option( Usero_Plugin::OPT_CLIENT_ID );
		$dashboard  = trailingslashit( USERO_API_BASE ) . 'clients/' . rawurlencode( $client_id ) . '/feedback';
		$front_page = home_url( '/' );
		$settings   = get_option( Usero_Plugin::OPT_SETTINGS, array() );
		$enabled    = ! empty( $settings['enabled'] );
		$detect     = self::detect_widget_on_homepage();
		$settings_url = add_query_arg( array( 'page' => self::PAGE_SLUG, 'tab' => 'settings' ), admin_url( 'options-general.php' ) );

		// Step icons
		$icon_ok      = '<span class="usero-checklist__icon usero-checklist__icon--ok" aria-hidden="true">&#10003;</span>';
		$icon_off     = '<span class="usero-checklist__icon usero-checklist__icon--off" aria-hidden="true">!</span>';
		$icon_pending = '<span class="usero-checklist__icon usero-checklist__icon--pending" aria-hidden="true">&#8230;</span>';

		?>
		<div class="usero-connected-bar">
			<span class="usero-badge">Connected</span>
			<span>as <strong><?php echo esc_html( $email ); ?></strong></span>
			<button type="button"
				class="button button-secondary"
				id="usero-disconnect"
				aria-label="Disconnect this site from your Usero account">
				Disconnect
			</button>
		</div>

		<ol class="usero-checklist" aria-label="Setup status">
			<li class="usero-checklist__item">
				<?php echo $enabled ? $icon_ok : $icon_off; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static markup ?>
				<div class="usero-checklist__body">
					<p class="usero-checklist__title">
						<?php echo $enabled ? 'Widget enabled' : 'Widget is turned off'; ?>
					</p>
					<p class="usero-checklist__desc">
						<?php if ( $enabled ) : ?>
							The widget is set to appear on your site.
						<?php else : ?>
							<a href="<?php echo esc_url( $settings_url ); ?>">Turn it on in Widget visibility</a> to start collecting feedback.
						<?php endif; ?>
					</p>
				</div>
			</li>
			<li class="usero-checklist__item">
				<?php
				if ( 'ok' === $detect['status'] ) {
					echo $icon_ok; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				} elseif ( 'missing' === $detect['status'] ) {
					echo $icon_off; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				} else {
					echo $icon_pending; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				}
				?>
				<div class="usero-checklist__body">
					<p class="usero-checklist__title">Widget detected on your homepage</p>
					<p class="usero-checklist__desc"><?php echo esc_html( $detect['detail'] ); ?></p>
				</div>
			</li>
			<li class="usero-checklist__item">
				<?php echo $icon_pending; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
				<div class="usero-checklist__body">
					<p class="usero-checklist__title">Feedback received</p>
					<p class="usero-checklist__desc">
						<a href="<?php echo esc_url( $dashboard ); ?>" target="_blank" rel="noopener">Open your inbox</a> to see what has come in.
					</p>
				</div>
			</li>
		</ol>

		<div class="usero-action-panel">
			<div class="usero-action-panel__main">
				<h2>Send a test from your site</h2>
				<p>Open your homepage in a new tab, click the widget bubble in the corner, and submit a piece of test feedback. It will appear in your inbox within a few seconds.</p>
				<p>
					<a class="button button-primary button-large" href="<?php echo esc_url( $front_page ); ?>" target="_blank" rel="noopener">
						Open my site in a new tab
					</a>
					<a class="button" href="<?php echo esc_url( $dashboard ); ?>" target="_blank" rel="noopener">Open inbox</a>
				</p>
			</div>
			<div class="usero-qr">
				<div class="usero-qr__canvas" data-usero-qr="<?php echo esc_attr( $front_page ); ?>" aria-hidden="true"></div>
				Or scan to test on your phone.
			</div>
		</div>
		<?php
	}

	private static function render_settings_tab() {
		$settings = get_option( Usero_Plugin::OPT_SETTINGS, array() );
		$enabled  = ! empty( $settings['enabled'] );
		$position = isset( $settings['position'] ) ? $settings['position'] : 'right';
		$accent   = isset( $settings['accent_color'] ) ? $settings['accent_color'] : '#7B5BFF';

		?>
		<div class="usero-settings-grid">
			<form method="post" action="options.php" style="margin-top: 1em;">
				<?php settings_fields( self::OPT_GROUP ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row">Widget visibility</th>
						<td>
							<label>
								<input type="checkbox" name="usero_settings[enabled]" value="1" <?php checked( $enabled ); ?> />
								Show the widget on the front end
							</label>
							<p class="description">When off, the widget is hidden from every visitor.</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="usero-position">Position</label></th>
						<td>
							<select id="usero-position" name="usero_settings[position]">
								<?php
								foreach ( array(
									'right' => 'Bottom right',
									'left'  => 'Bottom left',
								) as $val => $label ) {
									echo '<option value="' . esc_attr( $val ) . '"' . selected( $position, $val, false ) . '>' . esc_html( $label ) . '</option>';
								}
								?>
							</select>
							<span class="usero-position-picker" data-usero-position-picker aria-hidden="true">
								<span class="usero-position-picker__dot" data-corner="tl"></span>
								<span class="usero-position-picker__dot" data-corner="tr"></span>
								<span class="usero-position-picker__dot <?php echo 'left' === $position ? 'usero-position-picker__dot--active' : ''; ?>" data-corner="bl"></span>
								<span class="usero-position-picker__dot <?php echo 'right' === $position ? 'usero-position-picker__dot--active' : ''; ?>" data-corner="br"></span>
							</span>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="usero-accent">Accent color</label></th>
						<td>
							<input type="text" id="usero-accent" name="usero_settings[accent_color]"
								value="<?php echo esc_attr( $accent ); ?>" class="usero-color-picker" data-default-color="#7B5BFF" />
							<p class="description">Used for the widget button background.</p>
						</td>
					</tr>
				</table>
				<?php submit_button( 'Save changes' ); ?>
			</form>

			<aside class="usero-preview" data-usero-preview-root style="--usero-accent: <?php echo esc_attr( $accent ); ?>;">
				<p class="usero-preview__label">Live preview</p>
				<div class="usero-preview__viewport">
					<div class="usero-preview__bubble" data-position="<?php echo esc_attr( $position ); ?>">
						<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M4 5h16v10H8l-4 4V5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
						</svg>
					</div>
				</div>
				<p class="usero-preview__caption">Updates as you tweak settings.</p>
			</aside>
		</div>
		<?php
	}

	private static function render_pages_tab() {
		?>
		<h2>Embed the widget inline</h2>
		<p>By default the widget floats in a corner of every page. To embed it inline on a specific post or page, use either:</p>
		<ul>
			<li>Shortcode: <code>[usero_widget]</code></li>
			<li>HTML block with a class hook: <code>&lt;div class="usero-inline-widget"&gt;&lt;/div&gt;</code></li>
		</ul>
		<p>A Gutenberg block ships in version 1.1.</p>
		<?php
	}

	private static function render_advanced_tab() {
		$client_id = (string) get_option( Usero_Plugin::OPT_CLIENT_ID );
		?>
		<h2>Advanced</h2>
		<table class="form-table" role="presentation">
			<tr>
				<th scope="row"><label for="usero-client-id">Client ID</label></th>
				<td>
					<input type="text" id="usero-client-id" readonly class="regular-text code" value="<?php echo esc_attr( $client_id ); ?>" />
					<p class="description">Public identifier for your Usero client. Read-only.</p>
				</td>
			</tr>
			<tr>
				<th scope="row"><label for="usero-site-token">Site verification token</label></th>
				<td>
					<input type="text" id="usero-site-token" readonly class="regular-text code" value="<?php echo esc_attr( get_option( Usero_Plugin::OPT_SITE_TOKEN ) ); ?>" />
					<p class="description">Emitted as a meta tag on your homepage so we can verify you own this site during the connect handshake.</p>
				</td>
			</tr>
		</table>
		<?php
	}

	private static function render_pro_tab() {
		?>
		<h2>Pro</h2>
		<p>Pro is $29/month flat. Not per visitor, not per tracked user. Includes:</p>
		<ul style="list-style: disc; padding-left: 1.4em;">
			<li>Remove the "Powered by Usero" badge</li>
			<li>Custom domain for your public roadmap</li>
			<li>AI clustering of duplicate feedback</li>
			<li>AI-drafted pull requests against your repo</li>
			<li>Slack, Linear, Jira, Intercom, Zendesk integrations</li>
		</ul>
		<p>
			<a class="button button-primary" href="<?php echo esc_url( trailingslashit( USERO_API_BASE ) . 'pricing' ); ?>" target="_blank" rel="noopener">Upgrade on usero.io</a>
		</p>
		<?php
	}
}
