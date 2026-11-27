<?php
/**
 * Hardening for a public WordPress shop: closes common attack surfaces without
 * affecting the storefront. (Hide the admin login address with WPS Hide Login.)
 */
defined( 'ABSPATH' ) || exit;

// No theme/plugin code editor in the dashboard: a stolen admin password cannot be used
// to plant code through it.
if ( ! defined( 'DISALLOW_FILE_EDIT' ) ) {
	define( 'DISALLOW_FILE_EDIT', true );
}

class VC_Security {
	public static function init() {
		// XML-RPC is a common brute-force and amplification target; the shop does not use it.
		add_filter( 'xmlrpc_enabled', '__return_false' );
		add_filter( 'xmlrpc_methods', '__return_empty_array' ); // no pingbacks or multicall either
		add_filter( 'wp_headers', function ( $headers ) {
			unset( $headers['X-Pingback'] );
			return $headers;
		} );

		// Do not reveal the WordPress version.
		remove_action( 'wp_head', 'wp_generator' );
		add_filter( 'the_generator', '__return_empty_string' );

		// Stop listing staff usernames: /?author=N and the public users API.
		add_action( 'template_redirect', function () {
			if ( ! is_user_logged_in() && ( is_author() || isset( $_GET['author'] ) ) ) { // phpcs:ignore WordPress.Security.NonceVerification
				wp_safe_redirect( home_url( '/' ), 301 );
				exit;
			}
		}, 1 );
		add_filter( 'rest_endpoints', function ( $endpoints ) {
			if ( ! is_user_logged_in() ) {
				unset( $endpoints['/wp/v2/users'], $endpoints['/wp/v2/users/(?P<id>[\d]+)'] );
			}
			return $endpoints;
		} );
		add_filter( 'oembed_response_data', function ( $data ) {
			unset( $data['author_name'], $data['author_url'] );
			return $data;
		} );
		// The built-in sitemap would list staff usernames.
		add_filter( 'wp_sitemaps_add_provider', function ( $provider, $name ) {
			return 'users' === $name ? false : $provider;
		}, 10, 2 );
		// Generic login errors (no "unknown username" hints).
		add_filter( 'login_errors', function ( $message ) {
			return false !== strpos( (string) $message, 'Too many failed' ) ? $message : 'Incorrect sign-in details.';
		} );

		add_action( 'send_headers', array( __CLASS__, 'headers' ) );

		// Admin sign-in: lock for 15 minutes after repeated wrong passwords
		// (per account, and per connection across accounts).
		add_filter( 'authenticate', array( __CLASS__, 'login_gate' ), 30, 3 );
		add_action( 'wp_login_failed', array( __CLASS__, 'login_failed' ) );
		add_action( 'wp_login', function ( $login ) {
			VC_Limits::reset( 'wp-login-user', strtolower( $login ) );
		} );

		// A fresh REST nonce for the storefront scripts (pages may be served from a cache).
		add_action( 'wp_ajax_vc_nonce', array( __CLASS__, 'nonce' ) );
		add_action( 'wp_ajax_nopriv_vc_nonce', array( __CLASS__, 'nonce' ) );
	}

	public static function login_gate( $user, $username, $password ) {
		if ( '' === (string) $username ) {
			return $user;
		}
		$limit = max( 3, (int) VC_Settings::get_private( 'loginAttempts' ) );
		if ( VC_Limits::count( 'wp-login-user', strtolower( $username ) ) >= $limit || VC_Limits::count( 'wp-login-ip', VC_Limits::client_ip() ) >= $limit * 3 ) {
			return new WP_Error( 'vc_locked', 'Too many failed sign-in attempts. Try again in 15 minutes.' );
		}
		return $user;
	}

	public static function login_failed( $username ) {
		VC_Limits::hit( 'wp-login-user', strtolower( (string) $username ), PHP_INT_MAX, 15 * MINUTE_IN_SECONDS );
		VC_Limits::hit( 'wp-login-ip', VC_Limits::client_ip(), PHP_INT_MAX, 15 * MINUTE_IN_SECONDS );
	}

	public static function headers() {
		if ( headers_sent() ) {
			return;
		}
		header( 'X-Content-Type-Options: nosniff' );
		header( 'X-Frame-Options: SAMEORIGIN' );
		header( 'Referrer-Policy: strict-origin-when-cross-origin' );
		header( 'Permissions-Policy: camera=(), microphone=(), geolocation=(), usb=()' );
		if ( is_ssl() ) {
			header( 'Strict-Transport-Security: max-age=31536000' );
		}
	}

	public static function nonce() {
		nocache_headers();
		wp_send_json_success( array( 'nonce' => is_user_logged_in() ? wp_create_nonce( 'wp_rest' ) : '' ) );
	}
}
