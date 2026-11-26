<?php
/**
 * Plugin Name:       Vibecraft Core
 * Description:       Store engine for the Vibecraft theme: storefront API on top of WooCommerce, Vibe AI assistant, M-Pesa paybill checkout, county delivery fees, testimonials, store settings and a one-click import from the previous site.
 * Version:           1.0.0
 * Requires at least: 6.4
 * Requires PHP:      8.0
 * Requires Plugins:  woocommerce
 * Author:            Vibecraft
 * Text Domain:       vibecraft-core
 */

defined( 'ABSPATH' ) || exit;

define( 'VC_CORE_VERSION', '1.0.0' );
define( 'VC_CORE_FILE', __FILE__ );
define( 'VC_CORE_DIR', plugin_dir_path( __FILE__ ) );

require_once VC_CORE_DIR . 'includes/class-vc-settings.php';
require_once VC_CORE_DIR . 'includes/class-vc-limits.php';
require_once VC_CORE_DIR . 'includes/class-vc-products.php';
require_once VC_CORE_DIR . 'includes/class-vc-testimonials.php';
require_once VC_CORE_DIR . 'includes/class-vc-orders.php';
require_once VC_CORE_DIR . 'includes/class-vc-auth.php';
require_once VC_CORE_DIR . 'includes/class-vc-ai.php';
require_once VC_CORE_DIR . 'includes/class-vc-rest.php';
require_once VC_CORE_DIR . 'includes/class-vc-admin.php';
require_once VC_CORE_DIR . 'includes/class-vc-importer.php';
require_once VC_CORE_DIR . 'includes/class-vc-security.php';

add_action( 'plugins_loaded', function () {
	if ( ! class_exists( 'WooCommerce' ) ) {
		add_action( 'admin_notices', function () {
			echo '<div class="notice notice-error"><p><strong>Vibecraft Core</strong> needs WooCommerce. Install and activate WooCommerce first.</p></div>';
		} );
		return;
	}
	require_once VC_CORE_DIR . 'includes/class-vc-gateway.php';
	add_filter( 'woocommerce_payment_gateways', function ( $gateways ) {
		$gateways[] = 'VC_Gateway_Mpesa_Paybill';
		return $gateways;
	} );

	VC_Products::init();
	VC_Testimonials::init();
	VC_Orders::init();
	VC_Rest::init();
	VC_Admin::init();
	VC_Importer::init();
	VC_Security::init();
} );

// Pages, permalinks and WooCommerce options the theme expects.
register_activation_hook( __FILE__, function () {
	require_once VC_CORE_DIR . 'includes/class-vc-setup.php';
	VC_Setup::run();
} );
