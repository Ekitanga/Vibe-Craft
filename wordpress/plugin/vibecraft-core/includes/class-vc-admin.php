<?php
/**
 * WooCommerce → Vibecraft: store details, delivery fees, Vibe AI, Google sign-in,
 * abuse limits and the one-click import. Everything the storefront shows is editable
 * here — nothing is fixed in code.
 */
defined( 'ABSPATH' ) || exit;

class VC_Admin {
	const CAP  = 'manage_woocommerce';
	const SLUG = 'vibecraft';

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ), 60 );
		add_action( 'admin_post_vc_save_settings', array( __CLASS__, 'save' ) );
	}

	public static function menu() {
		add_submenu_page( 'woocommerce', 'Vibecraft', 'Vibecraft', self::CAP, self::SLUG, array( __CLASS__, 'page' ) );
	}

	private static function text_row( $name, $label, $value, $type = 'text', $help = '' ) {
		printf(
			'<tr><th scope="row"><label for="%1$s">%2$s</label></th><td><input type="%4$s" class="regular-text" id="%1$s" name="%1$s" value="%3$s" autocomplete="off">%5$s</td></tr>',
			esc_attr( $name ),
			esc_html( $label ),
			esc_attr( $value ),
			esc_attr( $type ),
			$help ? '<p class="description">' . wp_kses_post( $help ) . '</p>' : ''
		);
	}

	public static function page() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		$s   = VC_Settings::get();
		$p   = VC_Settings::get_private();
		$tab = isset( $_GET['tab'] ) ? sanitize_key( $_GET['tab'] ) : 'store'; // phpcs:ignore WordPress.Security.NonceVerification
		$tabs = array( 'store' => 'Store details', 'delivery' => 'Delivery fees', 'ai' => 'Vibe AI & sign-in', 'security' => 'Abuse limits', 'import' => 'Import' );
		echo '<div class="wrap"><h1>Vibecraft</h1>';
		if ( isset( $_GET['saved'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
			echo '<div class="notice notice-success is-dismissible"><p>Saved.</p></div>';
		}
		echo '<nav class="nav-tab-wrapper">';
		foreach ( $tabs as $key => $label ) {
			printf( '<a href="%s" class="nav-tab %s">%s</a>', esc_url( admin_url( 'admin.php?page=' . self::SLUG . '&tab=' . $key ) ), $tab === $key ? 'nav-tab-active' : '', esc_html( $label ) );
		}
		echo '</nav>';

		if ( 'import' === $tab ) {
			VC_Importer::render();
			echo '</div>';
			return;
		}

		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		wp_nonce_field( 'vc_save_settings' );
		echo '<input type="hidden" name="action" value="vc_save_settings"><input type="hidden" name="tab" value="' . esc_attr( $tab ) . '"><table class="form-table" role="presentation"><tbody>';

		if ( 'store' === $tab ) {
			self::text_row( 'storeName', 'Store name', $s['storeName'] );
			self::text_row( 'tagline', 'Tagline', $s['tagline'] );
			self::text_row( 'heroTitle', 'Home page headline', $s['heroTitle'] );
			self::text_row( 'heroDescription', 'Home page intro', $s['heroDescription'] );
			self::text_row( 'announcement', 'Announcement bar', $s['announcement'], 'text', 'Optional message shown across the top of the site.' );
			self::text_row( 'phone', 'Phone', $s['phone'] );
			self::text_row( 'whatsapp', 'WhatsApp number', $s['whatsapp'] );
			self::text_row( 'contactEmail', 'Contact email', $s['contactEmail'], 'email' );
			self::text_row( 'address', 'Shop address', $s['address'] );
			self::text_row( 'openingHours', 'Opening hours', $s['openingHours'] );
			self::text_row( 'paybill', 'M-Pesa paybill', $s['paybill'] );
			self::text_row( 'mpesaAccount', 'M-Pesa account number', $s['mpesaAccount'] );
			self::text_row( 'primaryColor', 'Brand colour', $s['primaryColor'], 'color' );
			self::text_row( 'accentColor', 'Accent colour', $s['accentColor'], 'color' );
			self::text_row( 'lowStockThreshold', '"Only a few left" from', (string) $s['lowStockThreshold'], 'number' );
			foreach ( array( 'instagram', 'tiktok', 'facebook', 'youtube' ) as $network ) {
				self::text_row( 'social_' . $network, ucfirst( $network ) . ' link', $s['socialLinks'][ $network ] ?? '', 'url' );
			}
		} elseif ( 'delivery' === $tab ) {
			self::text_row( 'freeDeliveryMinimum', 'Free delivery from (KES)', (string) $s['freeDeliveryMinimum'], 'number', '0 = never free.' );
			echo '</tbody></table><h2>Fee per county</h2><p>Untick a county to stop delivering there. Pickup at the shop is always free.</p><table class="widefat striped" style="max-width:560px"><thead><tr><th>County</th><th>Fee (KES)</th><th>Deliver</th></tr></thead><tbody>';
			foreach ( $s['deliveryFees'] as $county => $fee ) {
				$key = md5( $county );
				printf(
					'<tr><td>%1$s<input type="hidden" name="county[%2$s]" value="%1$s"></td><td><input type="number" min="0" step="1" name="fee[%2$s]" value="%3$s" style="width:120px"></td><td><input type="checkbox" name="available[%2$s]" value="1" %4$s></td></tr>',
					esc_html( $county ),
					esc_attr( $key ),
					esc_attr( (string) $fee ),
					checked( false !== ( $s['deliveryAvailability'][ $county ] ?? true ), true, false )
				);
			}
		} elseif ( 'ai' === $tab ) {
			self::text_row( 'geminiApiKey', 'Gemini API key', '', 'password', $p['geminiApiKey'] ? 'A key is saved (ends in <code>' . esc_html( substr( $p['geminiApiKey'], -4 ) ) . '</code>). Leave blank to keep it.' : 'Get one at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. Powers Vibe AI.' );
			self::text_row( 'geminiModel', 'Gemini model', $p['geminiModel'] );
			self::text_row( 'googleClientId', 'Google sign-in client ID', $p['googleClientId'], 'text', 'Google Cloud Console → Credentials → OAuth client (Web). Add your domain to its authorised JavaScript origins. Leave blank to hide "Sign in with Google".' );
		} elseif ( 'security' === $tab ) {
			self::text_row( 'ordersPerHourPerIp', 'Orders per hour per connection', (string) $p['ordersPerHourPerIp'], 'number', '0 = no limit.' );
			self::text_row( 'pendingOrdersPerPhone', 'Unconfirmed orders allowed per phone', (string) $p['pendingOrdersPerPhone'], 'number', 'Stops fake-order floods. 0 = no limit.' );
			self::text_row( 'aiMessagesPer5Min', 'Vibe AI messages per 5 minutes per connection', (string) $p['aiMessagesPer5Min'], 'number', 'Protects your Gemini quota.' );
			self::text_row( 'loginAttempts', 'Wrong passwords before a 15-minute lock', (string) $p['loginAttempts'], 'number' );
			self::text_row( 'signupsPerHourPerIp', 'New accounts per hour per connection', (string) $p['signupsPerHourPerIp'], 'number' );
			self::text_row( 'unpaidOrderExpiryHours', 'Cancel unpaid orders after (hours)', (string) $p['unpaidOrderExpiryHours'], 'number', 'Orders still On hold with no M-Pesa code are cancelled and their stock returned. Orders where the customer entered a code are never cancelled automatically. 0 = never.' );
		}
		echo '</tbody></table>';
		submit_button( 'Save' );
		echo '</form></div>';
	}

	public static function save() {
		if ( ! current_user_can( self::CAP ) ) {
			wp_die( 'Not allowed.' );
		}
		check_admin_referer( 'vc_save_settings' );
		$tab = sanitize_key( $_POST['tab'] ?? 'store' );
		$in  = wp_unslash( $_POST );

		if ( 'store' === $tab ) {
			$values = array();
			foreach ( array( 'storeName', 'tagline', 'heroTitle', 'heroDescription', 'announcement', 'phone', 'whatsapp', 'address', 'openingHours', 'paybill', 'mpesaAccount' ) as $key ) {
				$values[ $key ] = sanitize_text_field( $in[ $key ] ?? '' );
			}
			$values['contactEmail']      = sanitize_email( $in['contactEmail'] ?? '' );
			$values['primaryColor']      = sanitize_hex_color( $in['primaryColor'] ?? '' ) ?: '#cc3355';
			$values['accentColor']       = sanitize_hex_color( $in['accentColor'] ?? '' ) ?: '#ffd2d5';
			$values['lowStockThreshold'] = max( 0, (int) ( $in['lowStockThreshold'] ?? 5 ) );
			$social                      = array();
			foreach ( array( 'instagram', 'tiktok', 'facebook', 'youtube' ) as $network ) {
				$social[ $network ] = esc_url_raw( $in[ 'social_' . $network ] ?? '' );
			}
			$values['socialLinks'] = $social;
			VC_Settings::update( $values );
		} elseif ( 'delivery' === $tab ) {
			$fees      = array();
			$available = array();
			foreach ( (array) ( $in['county'] ?? array() ) as $key => $county ) {
				$county = sanitize_text_field( $county );
				if ( '' === $county ) {
					continue;
				}
				$fees[ $county ]      = max( 0, (int) ( $in['fee'][ $key ] ?? 0 ) );
				$available[ $county ] = ! empty( $in['available'][ $key ] );
			}
			VC_Settings::update( array(
				'deliveryFees'         => $fees,
				'deliveryAvailability' => $available,
				'freeDeliveryMinimum'  => max( 0, (float) ( $in['freeDeliveryMinimum'] ?? 0 ) ),
			) );
		} elseif ( 'ai' === $tab ) {
			$values = array(
				'geminiModel'    => sanitize_text_field( $in['geminiModel'] ?? '' ) ?: 'gemini-2.5-flash-lite',
				'googleClientId' => sanitize_text_field( $in['googleClientId'] ?? '' ),
			);
			$key = trim( sanitize_text_field( $in['geminiApiKey'] ?? '' ) );
			if ( '' !== $key ) {
				$values['geminiApiKey'] = $key;
			}
			VC_Settings::update_private( $values );
		} elseif ( 'security' === $tab ) {
			$values = array();
			foreach ( array( 'ordersPerHourPerIp', 'pendingOrdersPerPhone', 'aiMessagesPer5Min', 'loginAttempts', 'signupsPerHourPerIp', 'unpaidOrderExpiryHours' ) as $key ) {
				$values[ $key ] = max( 0, (int) ( $in[ $key ] ?? 0 ) );
			}
			VC_Settings::update_private( $values );
		}
		wp_safe_redirect( admin_url( 'admin.php?page=' . self::SLUG . '&tab=' . $tab . '&saved=1' ) );
		exit;
	}
}
