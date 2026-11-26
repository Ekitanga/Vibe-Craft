<?php
/**
 * Small fixed-window rate limiter on top of transients (works with or without an
 * object cache). Used for orders, sign-ins, sign-ups and the AI assistant.
 */
defined( 'ABSPATH' ) || exit;

class VC_Limits {
	public static function client_ip() {
		// REMOTE_ADDR is the only address a visitor cannot forge. Hosts behind a proxy
		// (EasyWP, Cloudflare) pass the visitor in a header the host itself sets.
		foreach ( array( 'HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP' ) as $header ) {
			if ( ! empty( $_SERVER[ $header ] ) && filter_var( wp_unslash( $_SERVER[ $header ] ), FILTER_VALIDATE_IP ) ) {
				return sanitize_text_field( wp_unslash( $_SERVER[ $header ] ) );
			}
		}
		return isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '0.0.0.0';
	}

	private static function key( $bucket, $subject ) {
		return 'vc_rl_' . substr( md5( $bucket . '|' . strtolower( (string) $subject ) ), 0, 24 );
	}

	/** Returns true when the action is allowed (and counts it). $limit <= 0 disables. */
	public static function hit( $bucket, $subject, $limit, $window_seconds ) {
		$limit = (int) $limit;
		if ( $limit <= 0 ) {
			return true;
		}
		$key   = self::key( $bucket, $subject );
		$state = get_transient( $key );
		if ( ! is_array( $state ) || $state['until'] < time() ) {
			$state = array( 'count' => 0, 'until' => time() + $window_seconds );
		}
		if ( $state['count'] >= $limit ) {
			return false;
		}
		$state['count']++;
		set_transient( $key, $state, max( 1, $state['until'] - time() ) );
		return true;
	}

	public static function count( $bucket, $subject ) {
		$state = get_transient( self::key( $bucket, $subject ) );
		return is_array( $state ) && $state['until'] >= time() ? (int) $state['count'] : 0;
	}

	public static function reset( $bucket, $subject ) {
		delete_transient( self::key( $bucket, $subject ) );
	}
}
