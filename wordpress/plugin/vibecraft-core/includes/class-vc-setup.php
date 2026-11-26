<?php
/**
 * One-time setup on activation: the pages the theme uses, WooCommerce options (KES,
 * Kenya, guest checkout) and clean product addresses (/products/<slug>/).
 * Existing pages and settings the owner already changed are left alone.
 */
defined( 'ABSPATH' ) || exit;

class VC_Setup {
	public static function run() {
		$pages = array(
			'home'            => array( 'Home', '' ),
			'shop'            => array( 'Shop', '' ),
			'about'           => array( 'About', '' ),
			'contact'         => array( 'Contact', '' ),
			'cart'            => array( 'Cart', '' ),
			'checkout'        => array( 'Checkout', '<!-- wp:shortcode -->[woocommerce_checkout]<!-- /wp:shortcode -->' ),
			'login'           => array( 'Log in', '' ),
			'signup'          => array( 'Sign up', '' ),
			'account'         => array( 'My account', '<!-- wp:shortcode -->[woocommerce_my_account]<!-- /wp:shortcode -->' ),
			'find-your-setup' => array( 'Find your setup', '' ),
			'privacy'         => array( 'Privacy policy', self::policy( 'privacy' ) ),
			'terms'           => array( 'Terms of service', self::policy( 'terms' ) ),
			'refunds'         => array( 'Returns & refunds', self::policy( 'refunds' ) ),
		);
		$ids = array();
		foreach ( $pages as $slug => $page ) {
			$existing = get_page_by_path( $slug );
			$ids[ $slug ] = $existing ? $existing->ID : wp_insert_post( array(
				'post_type'    => 'page',
				'post_status'  => 'publish',
				'post_name'    => $slug,
				'post_title'   => $page[0],
				'post_content' => $page[1],
			) );
		}

		// WooCommerce/WordPress sample pages that would duplicate ours.
		foreach ( array( 'my-account', 'refund_returns', 'sample-page', 'privacy-policy' ) as $slug ) {
			$page = get_page_by_path( $slug );
			if ( $page && ! in_array( (int) $page->ID, array_map( 'intval', $ids ), true ) ) {
				wp_trash_post( $page->ID );
			}
		}

		update_option( 'show_on_front', 'page' );
		update_option( 'page_on_front', $ids['home'] );
		update_option( 'wp_page_for_privacy_policy', $ids['privacy'] );
		update_option( 'woocommerce_shop_page_id', $ids['shop'] );
		update_option( 'woocommerce_cart_page_id', $ids['cart'] );
		update_option( 'woocommerce_checkout_page_id', $ids['checkout'] );
		update_option( 'woocommerce_myaccount_page_id', $ids['account'] );
		update_option( 'woocommerce_terms_page_id', $ids['terms'] );

		// Store basics: Kenya, shillings, whole-number prices, guest checkout, coupons.
		update_option( 'woocommerce_default_country', 'KE' );
		update_option( 'woocommerce_currency', 'KES' );
		update_option( 'woocommerce_price_num_decimals', 0 );
		update_option( 'woocommerce_enable_guest_checkout', 'yes' );
		update_option( 'woocommerce_enable_coupons', 'yes' );
		update_option( 'woocommerce_manage_stock', 'yes' );
		update_option( 'woocommerce_hold_stock_minutes', '' );
		update_option( 'woocommerce_ship_to_countries', 'specific' );
		update_option( 'woocommerce_specific_ship_to_countries', array( 'KE' ) );
		update_option( 'woocommerce_allowed_countries', 'specific' );
		update_option( 'woocommerce_specific_allowed_countries', array( 'KE' ) );
		update_option( 'woocommerce_coming_soon', 'no' );

		// Clean addresses: /products/<slug> and /category/<slug>.
		// No trailing slash, matching the previous site's addresses (/cart, /products/x).
		update_option( 'permalink_structure', '/%postname%' );
		$permalinks                  = (array) get_option( 'woocommerce_permalinks', array() );
		$permalinks['product_base']  = '/products';
		$permalinks['category_base'] = 'category';
		update_option( 'woocommerce_permalinks', $permalinks );
		delete_option( 'rewrite_rules' );
	}

	private static function policy( $kind ) {
		$settings = VC_Settings::get();
		$contact  = implode( ', ', array_filter( array(
			$settings['phone'] ? 'phone/WhatsApp ' . $settings['phone'] : '',
			$settings['contactEmail'] ? 'email ' . $settings['contactEmail'] : '',
			$settings['address'],
		) ) );
		$sections = array(
			'privacy' => array(
				'Who we are'          => $settings['storeName'] . ' sells projectors and accessories in Kenya. We are the data controller for the personal data described here, under the Kenya Data Protection Act, 2019.',
				'What we collect'     => 'When you order or create an account we collect your name, phone number, email address, delivery address and M-Pesa transaction details. We also collect basic technical data such as your IP address, browser type and the pages you visit.',
				'Why we use it'       => 'To process and deliver your orders, confirm payments, contact you about your order, keep your account secure, and improve our store. With your consent we use advertising cookies (Meta Pixel) to measure and improve our adverts on Facebook and Instagram. Contact details are hashed before they are shared with Meta.',
				'Who we share it with' => 'Delivery partners (to deliver your order), Safaricom M-Pesa (to process payments), Meta Platforms (advertising measurement), Google (sign-in, if you use it) and our hosting providers. We do not sell your personal data.',
				'How long we keep it' => 'Order records are kept for as long as required for accounting and tax purposes. You can ask us to delete your account at any time.',
				'Your rights'         => 'You may ask to access, correct or delete your personal data, object to processing, or withdraw consent for advertising cookies. You can also complain to the Office of the Data Protection Commissioner.',
				'Contact'             => $contact,
			),
			'terms'   => array(
				'Orders'   => 'Placing an order is an offer to buy. We confirm orders by phone or WhatsApp before delivery. Prices are in Kenyan Shillings and exclude VAT unless stated.',
				'Payment'  => 'Pay via M-Pesa Paybill ' . $settings['paybill'] . ', account ' . $settings['mpesaAccount'] . ', or on delivery where offered.',
				'Delivery' => 'Delivery times are estimates. Unconfirmed, unpaid orders may be cancelled.',
				'Contact'  => $contact,
			),
			'refunds' => array(
				'Returns' => 'Contact us within 7 days of delivery if your item is faulty or not as described. Items must be returned in their original packaging with all accessories.',
				'Refunds' => 'Approved refunds are paid back via M-Pesa once the returned item has been inspected.',
				'Contact' => $contact,
			),
		);
		$html = '';
		foreach ( $sections[ $kind ] as $heading => $text ) {
			$html .= '<!-- wp:heading --><h2>' . esc_html( $heading ) . "</h2><!-- /wp:heading -->\n<!-- wp:paragraph --><p>" . esc_html( $text ) . "</p><!-- /wp:paragraph -->\n";
		}
		return $html;
	}
}
