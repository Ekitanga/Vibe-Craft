<?php
/**
 * Customer accounts for the storefront (WordPress users with the WooCommerce
 * "customer" role). Staff accounts are refused here: they sign in at the private admin
 * address only, so the shop's login form cannot be used to attack them.
 */
defined( 'ABSPATH' ) || exit;

class VC_Auth {
	private static function fail( $message, $status = 400 ) {
		throw new VC_Http_Error( $message, $status );
	}

	public static function is_staff( $user ) {
		return $user && ( user_can( $user, 'edit_posts' ) || user_can( $user, 'manage_woocommerce' ) );
	}

	public static function to_api( $user ) {
		$google = (bool) get_user_meta( $user->ID, '_vc_google_sub', true );
		return array(
			'id'              => (string) $user->ID,
			'name'            => trim( $user->display_name ) ?: $user->user_email,
			'email'           => $user->user_email,
			'phone'           => get_user_meta( $user->ID, 'billing_phone', true ) ?: null,
			'profileImageUrl' => get_user_meta( $user->ID, '_vc_avatar', true ) ?: null,
			'hasPassword'     => ! get_user_meta( $user->ID, '_vc_google_only', true ),
			'hasGoogleLinked' => $google,
			'emailVerified'   => $google || (bool) get_user_meta( $user->ID, '_vc_email_verified', true ),
			'createdAt'       => mysql2date( DATE_ATOM, $user->user_registered, false ),
		);
	}

	public static function current() {
		$user = wp_get_current_user();
		if ( ! $user || ! $user->ID || self::is_staff( $user ) ) {
			return null;
		}
		return $user;
	}

	private static function sign_in( $user ) {
		wp_set_current_user( $user->ID );
		wp_set_auth_cookie( $user->ID, true, is_ssl() );
		do_action( 'wp_login', $user->user_login, $user );
		return array( 'user' => self::to_api( $user ), 'nonce' => wp_create_nonce( 'wp_rest' ) );
	}

	public static function login( $email, $password ) {
		$email    = strtolower( trim( (string) $email ) );
		$ip       = VC_Limits::client_ip();
		$attempts = (int) VC_Settings::get_private( 'loginAttempts' );
		// Per account and per connection: repeated wrong passwords lock sign-in for 15 minutes.
		if ( VC_Limits::count( 'login-fail', $email ) >= $attempts || VC_Limits::count( 'login-fail-ip', $ip ) >= $attempts * 4 ) {
			self::fail( 'Too many sign-in attempts. Please wait 15 minutes and try again.', 429 );
		}
		$user = $email ? get_user_by( 'email', $email ) : false;
		$ok   = $user && ! self::is_staff( $user ) && wp_check_password( (string) $password, $user->user_pass, $user->ID );
		if ( ! $ok ) {
			VC_Limits::hit( 'login-fail', $email, PHP_INT_MAX, 15 * MINUTE_IN_SECONDS );
			VC_Limits::hit( 'login-fail-ip', $ip, PHP_INT_MAX, 15 * MINUTE_IN_SECONDS );
			self::fail( 'Invalid email or password.', 401 );
		}
		VC_Limits::reset( 'login-fail', $email );
		return self::sign_in( $user );
	}

	public static function signup( array $input ) {
		if ( ! VC_Limits::hit( 'signup', VC_Limits::client_ip(), VC_Settings::get_private( 'signupsPerHourPerIp' ), HOUR_IN_SECONDS ) ) {
			self::fail( 'Too many new accounts from this connection. Please try again later.', 429 );
		}
		$name     = trim( sanitize_text_field( (string) ( $input['name'] ?? '' ) ) );
		$email    = strtolower( trim( sanitize_email( (string) ( $input['email'] ?? '' ) ) ) );
		$phone    = trim( sanitize_text_field( (string) ( $input['phone'] ?? '' ) ) );
		$password = (string) ( $input['password'] ?? '' );
		if ( strlen( $name ) < 2 ) {
			self::fail( 'Please enter your full name.' );
		}
		if ( ! is_email( $email ) ) {
			self::fail( 'Please enter a valid email address.' );
		}
		self::check_password( $password, $email );
		if ( email_exists( $email ) ) {
			self::fail( 'An account with this email already exists. Sign in instead.', 409 );
		}
		$user_id = wc_create_new_customer( $email, '', $password, array( 'first_name' => $name, 'display_name' => $name ) );
		if ( is_wp_error( $user_id ) ) {
			self::fail( wp_strip_all_tags( $user_id->get_error_message() ) );
		}
		wp_update_user( array( 'ID' => $user_id, 'display_name' => $name ) );
		if ( $phone ) {
			update_user_meta( $user_id, 'billing_phone', $phone );
		}
		return self::sign_in( get_user_by( 'id', $user_id ) );
	}

	public static function check_password( $password, $email = '' ) {
		if ( strlen( $password ) < 8 ) {
			self::fail( 'Use a password of at least 8 characters.' );
		}
		$local = strtolower( strtok( (string) $email, '@' ) );
		if ( $local && strlen( $local ) >= 4 && false !== stripos( $password, $local ) ) {
			self::fail( 'Your password should not contain your email address.' );
		}
		if ( in_array( strtolower( $password ), array( 'password', 'password1', '12345678', '123456789', 'qwertyuiop', 'vibecraft' ), true ) ) {
			self::fail( 'That password is too common. Choose another.' );
		}
	}

	public static function change_password( $current, $new ) {
		$user = self::current();
		if ( ! $user ) {
			self::fail( 'Please sign in.', 401 );
		}
		$google_only = (bool) get_user_meta( $user->ID, '_vc_google_only', true );
		if ( ! $google_only && ! wp_check_password( (string) $current, $user->user_pass, $user->ID ) ) {
			self::fail( 'Your current password is incorrect.', 401 );
		}
		self::check_password( (string) $new, $user->user_email );
		wp_set_password( (string) $new, $user->ID ); // also signs out other sessions
		delete_user_meta( $user->ID, '_vc_google_only' );
		return self::sign_in( get_user_by( 'id', $user->ID ) );
	}

	public static function google( $id_token ) {
		$client_id = VC_Settings::google_client_id();
		if ( ! $client_id ) {
			self::fail( 'Google sign-in is not set up yet.', 503 );
		}
		if ( ! is_string( $id_token ) || strlen( $id_token ) < 20 || strlen( $id_token ) > 4096 ) {
			self::fail( 'Google sign-in failed. Please try again.' );
		}
		$response = wp_remote_get( 'https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode( $id_token ), array( 'timeout' => 10 ) );
		$claims   = is_wp_error( $response ) ? null : json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $claims ) || 200 !== wp_remote_retrieve_response_code( $response )
			|| ( $claims['aud'] ?? '' ) !== $client_id
			|| ! in_array( $claims['iss'] ?? '', array( 'accounts.google.com', 'https://accounts.google.com' ), true )
			|| (int) ( $claims['exp'] ?? 0 ) < time()
			|| 'true' !== (string) ( $claims['email_verified'] ?? '' ) ) {
			self::fail( 'Google sign-in failed. Please try again.', 401 );
		}
		$email = strtolower( sanitize_email( $claims['email'] ) );
		$sub   = sanitize_text_field( $claims['sub'] );
		$user  = get_user_by( 'email', $email );
		if ( $user && self::is_staff( $user ) ) {
			self::fail( 'Google sign-in failed. Please try again.', 401 );
		}
		if ( ! $user ) {
			$name    = sanitize_text_field( $claims['name'] ?? '' ) ?: strtok( $email, '@' );
			$user_id = wc_create_new_customer( $email, '', wp_generate_password( 32, true, true ), array( 'first_name' => $name, 'display_name' => $name ) );
			if ( is_wp_error( $user_id ) ) {
				self::fail( 'Could not create your account. Please try again.', 500 );
			}
			wp_update_user( array( 'ID' => $user_id, 'display_name' => $name ) );
			update_user_meta( $user_id, '_vc_google_only', 1 );
			$user = get_user_by( 'id', $user_id );
		} elseif ( ! get_user_meta( $user->ID, '_vc_google_sub', true ) && ! get_user_meta( $user->ID, '_vc_email_verified', true ) ) {
			// Someone registered this email with a password but never proved they own it.
			// Google has now proven ownership: lock out the unverified password.
			wp_set_password( wp_generate_password( 32, true, true ), $user->ID );
			update_user_meta( $user->ID, '_vc_google_only', 1 );
		}
		update_user_meta( $user->ID, '_vc_google_sub', $sub );
		update_user_meta( $user->ID, '_vc_email_verified', 1 );
		if ( ! empty( $claims['picture'] ) ) {
			update_user_meta( $user->ID, '_vc_avatar', esc_url_raw( $claims['picture'] ) );
		}
		return self::sign_in( get_user_by( 'id', $user->ID ) );
	}

	public static function logout() {
		wp_logout();
		return array( 'loggedOut' => true, 'nonce' => '' );
	}
}
