<?php
/**
 * Vibecraft theme: serves the approved storefront pages (html/) unchanged in look,
 * with data from WooCommerce via the Vibecraft Core plugin.
 */
defined( 'ABSPATH' ) || exit;

define( 'VC_THEME_VERSION', '1.0.0' );

require_once get_template_directory() . '/inc/render.php';

add_action( 'after_setup_theme', function () {
	add_theme_support( 'woocommerce' );
	add_theme_support( 'html5', array( 'search-form', 'gallery', 'caption', 'script', 'style' ) );
} );

// The storefront has its own styles: keep WordPress/WooCommerce front-end styles out of
// the designed pages (they stay on the plain WooCommerce pages: account details, lost
// password, the fallback checkout).
add_action( 'wp_enqueue_scripts', function () {
	if ( ! VC_Theme::is_designed_page() ) {
		return;
	}
	foreach ( array( 'wp-block-library', 'wp-block-library-theme', 'global-styles', 'classic-theme-styles', 'wc-blocks-style', 'woocommerce-general', 'woocommerce-layout', 'woocommerce-smallscreen' ) as $handle ) {
		wp_dequeue_style( $handle );
	}
	foreach ( array( 'wc-cart-fragments', 'woocommerce', 'wc-add-to-cart', 'sourcebuster-js', 'wc-order-attribution' ) as $handle ) {
		wp_dequeue_script( $handle );
	}
}, 100 );
remove_action( 'wp_head', 'print_emoji_detection_script', 7 );
remove_action( 'wp_print_styles', 'print_emoji_styles' );
remove_action( 'wp_head', 'rsd_link' );
remove_action( 'wp_head', 'wlwmanifest_link' );
remove_action( 'wp_head', 'wp_shortlink_wp_head' );

// Old-style page addresses used by the scripts (cart.html …) → clean addresses.
add_action( 'template_redirect', array( 'VC_Theme', 'redirect_html_addresses' ), 0 );

// Choose which storefront page to render.
add_filter( 'template_include', array( 'VC_Theme', 'template' ), 99 );

// Only the main admin bar for staff; never for customers.
add_filter( 'show_admin_bar', function ( $show ) {
	return $show && current_user_can( 'edit_posts' );
} );
