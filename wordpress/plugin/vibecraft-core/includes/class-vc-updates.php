<?php
/**
 * Safe automatic updates.
 *
 * Everything from WordPress.org updates itself — WordPress, plugins, themes — but only
 * after a waiting period, so problems found by other sites surface first:
 *   - plugin/theme updates: 3 days after release (7 days when the major or minor number
 *     changes, e.g. WooCommerce 11.3 → 11.4 or 11 → 12);
 *   - WordPress: security/maintenance releases at once; new versions only from their
 *     first fix release (e.g. 7.2.1, never 7.2.0).
 * After every automatic update the shop is checked (home, a product page, the cart, the
 * product API). If a check fails, the plugins just updated are put back to their previous
 * version, paused for 14 days, and the owner is emailed. WordPress itself also rolls back
 * a plugin update that causes a fatal error.
 */
defined( 'ABSPATH' ) || exit;

class VC_Updates {
	const STATE      = 'vc_update_state';
	const WAIT_PATCH = 3;  // days
	const WAIT_MINOR = 7;  // days
	const PAUSE_DAYS = 14;

	public static function init() {
		add_filter( 'auto_update_plugin', array( __CLASS__, 'plugin_decision' ), 20, 2 );
		add_filter( 'auto_update_theme', array( __CLASS__, 'theme_decision' ), 20, 2 );
		add_filter( 'auto_update_core', array( __CLASS__, 'core_decision' ), 20, 2 );
		add_filter( 'allow_minor_auto_core_updates', '__return_true' );
		add_filter( 'allow_major_auto_core_updates', '__return_true' ); // gated in core_decision
		add_filter( 'auto_update_translation', '__return_true' );
		// Remember versions before each automatic update, check the shop afterwards.
		add_action( 'pre_auto_update', array( __CLASS__, 'remember_version' ), 10, 2 );
		add_action( 'automatic_updates_complete', array( __CLASS__, 'after_updates' ) );
		// Our own report replaces WordPress's per-update success emails.
		add_filter( 'auto_plugin_update_send_email', '__return_false' );
		add_filter( 'auto_theme_update_send_email', '__return_false' );
		add_filter( 'auto_core_update_send_email', function ( $send, $type ) {
			return 'success' !== $type; // still email when a core update fails
		}, 10, 2 );
	}

	public static function state() {
		$state = get_option( self::STATE, array() );
		return wp_parse_args( is_array( $state ) ? $state : array(), array( 'paused' => array(), 'before' => array(), 'last_check' => null, 'last_result' => null, 'log' => array() ) );
	}

	private static function save( $state ) {
		$state['log'] = array_slice( (array) $state['log'], -30 );
		update_option( self::STATE, $state, false );
	}

	private static function log( &$state, $message ) {
		$state['log'][] = gmdate( 'Y-m-d H:i' ) . ' UTC — ' . $message;
	}

	/** Days since this version was released on WordPress.org (null if unknown). */
	private static function release_age_days( $type, $slug, $version ) {
		$key  = 'vc_rel_' . md5( $type . $slug . $version );
		$date = get_transient( $key );
		if ( false === $date ) {
			if ( 'plugin' === $type ) {
				require_once ABSPATH . 'wp-admin/includes/plugin-install.php';
				$info = plugins_api( 'plugin_information', array( 'slug' => $slug, 'fields' => array( 'sections' => false, 'last_updated' => true, 'versions' => false ) ) );
			} else {
				require_once ABSPATH . 'wp-admin/includes/theme.php';
				$info = themes_api( 'theme_information', array( 'slug' => $slug, 'fields' => array( 'sections' => false, 'last_updated' => true ) ) );
			}
			$date = ( ! is_wp_error( $info ) && ! empty( $info->last_updated ) && isset( $info->version ) && version_compare( $info->version, $version, '==' ) ) ? strtotime( $info->last_updated ) : 0;
			set_transient( $key, $date, 6 * HOUR_IN_SECONDS );
		}
		return $date ? ( time() - (int) $date ) / DAY_IN_SECONDS : null;
	}

	private static function required_wait( $current, $new ) {
		$a = array_map( 'intval', explode( '.', (string) $current ) + array( 0, 0, 0 ) );
		$b = array_map( 'intval', explode( '.', (string) $new ) + array( 0, 0, 0 ) );
		return ( $a[0] !== $b[0] || $a[1] !== $b[1] ) ? self::WAIT_MINOR : self::WAIT_PATCH;
	}

	public static function plugin_decision( $update, $item ) {
		$slug  = $item->slug ?? '';
		$state = self::state();
		if ( ! $slug || empty( $item->new_version ) ) {
			return $update;
		}
		if ( isset( $state['paused'][ $slug ] ) && $state['paused'][ $slug ] > time() ) {
			return false;
		}
		$file    = $item->plugin ?? '';
		$current = '';
		if ( $file ) {
			if ( ! function_exists( 'get_plugins' ) ) {
				require_once ABSPATH . 'wp-admin/includes/plugin.php';
			}
			$all     = get_plugins();
			$current = $all[ $file ]['Version'] ?? '';
		}
		$age = self::release_age_days( 'plugin', $slug, $item->new_version );
		// Unknown release date (e.g. not from WordPress.org): never auto-update.
		return null !== $age && $age >= self::required_wait( $current, $item->new_version );
	}

	public static function theme_decision( $update, $item ) {
		$slug = $item->theme ?? '';
		if ( ! $slug || empty( $item->new_version ) ) {
			return $update;
		}
		$theme = wp_get_theme( $slug );
		$age   = self::release_age_days( 'theme', $slug, $item->new_version );
		return null !== $age && $age >= self::required_wait( $theme->get( 'Version' ), $item->new_version );
	}

	public static function core_decision( $update, $item ) {
		$offered = (string) ( $item->current ?? '' );
		$parts   = array_map( 'intval', explode( '.', $offered ) + array( 0, 0, 0 ) );
		$branch  = implode( '.', array_slice( explode( '.', get_bloginfo( 'version' ) ), 0, 2 ) );
		// Same branch (security/maintenance release): always. New branch: only from x.y.1.
		if ( 0 === strpos( $offered, $branch . '.' ) || $offered === $branch ) {
			return true;
		}
		return $parts[2] >= 1;
	}

	public static function remember_version( $type, $item ) {
		if ( 'plugin' !== $type || empty( $item->plugin ) ) {
			return;
		}
		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		$all   = get_plugins();
		$state = self::state();
		$state['before'][ $item->plugin ] = array(
			'slug'    => $item->slug,
			'version' => $all[ $item->plugin ]['Version'] ?? '',
			'new'     => $item->new_version ?? '',
		);
		self::save( $state );
	}

	/** Checks the pages customers use. Returns a list of problems (empty = healthy). */
	public static function health_check() {
		$problems = array();
		$product  = wc_get_products( array( 'status' => 'publish', 'limit' => 1, 'return' => 'ids' ) );
		$checks   = array(
			'Home page'    => array( home_url( '/' ), 'vc-meta.js' ),
			'Cart page'    => array( home_url( '/cart' ), 'checkoutForm' ),
			'Product data' => array( rest_url( 'vibecraft/v1/products' ), '"success":true' ),
		);
		if ( $product ) {
			$checks['Product page'] = array( get_permalink( $product[0] ), 'productDetail' );
		}
		foreach ( $checks as $label => $check ) {
			$response = wp_remote_get( add_query_arg( 'vc_health', time(), $check[0] ), array( 'timeout' => 25, 'sslverify' => false, 'redirection' => 3 ) );
			$code     = is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response );
			$body     = is_wp_error( $response ) ? '' : wp_remote_retrieve_body( $response );
			if ( 200 !== $code || false === strpos( $body, $check[1] ) ) {
				$problems[] = $label . ' (' . ( is_wp_error( $response ) ? $response->get_error_message() : 'HTTP ' . $code ) . ')';
			}
		}
		return $problems;
	}

	public static function after_updates( $results ) {
		$state   = self::state();
		$updated = array();
		foreach ( (array) ( $results['plugin'] ?? array() ) as $result ) {
			if ( ! empty( $result->result ) && ! is_wp_error( $result->result ) && ! empty( $result->item->plugin ) ) {
				$updated[ $result->item->plugin ] = $state['before'][ $result->item->plugin ] ?? array( 'slug' => $result->item->slug, 'version' => '', 'new' => $result->item->new_version ?? '' );
			}
		}
		$others = array();
		foreach ( array( 'core', 'theme', 'translation' ) as $type ) {
			foreach ( (array) ( $results[ $type ] ?? array() ) as $result ) {
				if ( ! empty( $result->result ) && ! is_wp_error( $result->result ) ) {
					$others[] = $type . ': ' . ( $result->name ?? '' );
				}
			}
		}
		if ( ! $updated && ! $others ) {
			return;
		}
		$problems             = self::health_check();
		$state['last_check']  = time();
		$state['last_result'] = $problems ? 'failed: ' . implode( ', ', $problems ) : 'healthy';
		$lines                = array();
		foreach ( $updated as $file => $info ) {
			$lines[] = $info['slug'] . ' ' . $info['version'] . ' → ' . $info['new'];
		}
		$lines = array_merge( $lines, $others );
		self::log( $state, 'Updated: ' . implode( '; ', $lines ) . ' — check ' . $state['last_result'] );

		$rolled = array();
		if ( $problems && $updated ) {
			foreach ( $updated as $file => $info ) {
				if ( $info['version'] && self::rollback( $info['slug'], $info['version'] ) ) {
					$rolled[] = $info['slug'] . ' back to ' . $info['version'];
				}
				$state['paused'][ $info['slug'] ] = time() + self::PAUSE_DAYS * DAY_IN_SECONDS;
			}
			$after                = self::health_check();
			$state['last_result'] = $after ? 'still failing after rollback: ' . implode( ', ', $after ) : 'healthy after rollback';
			self::log( $state, 'Rolled back: ' . ( $rolled ? implode( '; ', $rolled ) : 'nothing could be rolled back' ) . ' — ' . $state['last_result'] );
		}
		self::save( $state );

		$subject = $problems ? '⚠ Vibecraft254: an update broke something — ' . ( $rolled ? 'rolled back' : 'please check' ) : 'Vibecraft254: updates installed, shop checked OK';
		$body    = "Automatic updates on " . home_url() . ":\n\n- " . implode( "\n- ", $lines ) . "\n\nShop check: " . ( $problems ? 'FAILED — ' . implode( ', ', $problems ) : 'all pages OK' ) . "\n";
		if ( $problems ) {
			$body .= "\n" . ( $rolled ? 'Rolled back: ' . implode( '; ', $rolled ) . ". These are paused for " . self::PAUSE_DAYS . " days.\nAfter rollback: " . $state['last_result'] : 'Nothing could be rolled back automatically. Please check the site.' ) . "\n";
		}
		wp_mail( get_option( 'admin_email' ), $subject, $body );
	}

	/** Reinstalls a plugin's previous version from WordPress.org. */
	public static function rollback( $slug, $version ) {
		require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/plugin.php';
		$package  = 'https://downloads.wordpress.org/plugin/' . rawurlencode( $slug ) . '.' . rawurlencode( $version ) . '.zip';
		$upgrader = new Plugin_Upgrader( new Automatic_Upgrader_Skin() );
		$result   = $upgrader->run( array(
			'package'           => $package,
			'destination'       => WP_PLUGIN_DIR,
			'clear_destination' => true,
			'clear_working'     => true,
			'hook_extra'        => array( 'type' => 'plugin', 'action' => 'install' ),
		) );
		return $result && ! is_wp_error( $result );
	}
}
