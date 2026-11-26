<?php
/**
 * Storefront API: /wp-json/vibecraft/v1/… with the same paths and response shapes the
 * storefront scripts already use ({ success, data } / { success: false, message }).
 */
defined( 'ABSPATH' ) || exit;

class VC_Rest {
	const NS = 'vibecraft/v1';

	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
		add_filter( 'rest_pre_dispatch', array( __CLASS__, 'guard' ), 10, 3 );
		add_filter( 'rest_post_dispatch', array( __CLASS__, 'no_cache' ), 10, 3 );
	}

	private static function route( $path, $method, $callback ) {
		register_rest_route( self::NS, $path, array(
			'methods'             => $method,
			'permission_callback' => '__return_true', // access rules live in each handler
			'callback'            => function ( WP_REST_Request $request ) use ( $callback ) {
				try {
					$result = call_user_func( $callback, $request );
					$body   = array( 'success' => true, 'data' => $result );
					if ( is_array( $result ) && ( array() === $result || array_keys( $result ) === range( 0, count( $result ) - 1 ) ) ) {
						$body['count'] = count( $result );
					}
					return new WP_REST_Response( $body, 200 );
				} catch ( VC_Http_Error $error ) {
					return new WP_REST_Response( array( 'success' => false, 'message' => $error->getMessage() ), $error->status );
				} catch ( Throwable $error ) {
					error_log( 'Vibecraft API error: ' . $error->getMessage() );
					return new WP_REST_Response( array( 'success' => false, 'message' => 'Something went wrong. Please try again.' ), 500 );
				}
			},
		) );
	}

	private static function json( WP_REST_Request $request ) {
		$body = $request->get_json_params();
		return is_array( $body ) ? $body : array();
	}

	private static function require_customer() {
		$user = VC_Auth::current();
		if ( ! $user ) {
			throw new VC_Http_Error( 'Please sign in.', 401 );
		}
		return $user;
	}

	public static function routes() {
		// Catalog & store.
		self::route( '/products', 'GET', function ( $request ) {
			return VC_Products::query( array( 'category' => $request->get_param( 'category' ), 'featured' => $request->get_param( 'featured' ) ) );
		} );
		self::route( '/products/(?P<key>[^/]+)', 'GET', function ( $request ) {
			$product = VC_Products::find( rawurldecode( $request['key'] ) );
			if ( ! $product ) {
				throw new VC_Http_Error( 'Product not found', 404 );
			}
			return VC_Products::to_api( $product );
		} );
		self::route( '/categories', 'GET', function () {
			$terms = get_terms( array( 'taxonomy' => 'product_cat', 'hide_empty' => false ) );
			$terms = is_wp_error( $terms ) ? array() : $terms;
			return array_values( array_map( function ( $term ) {
				return array( 'id' => $term->slug, 'name' => html_entity_decode( $term->name, ENT_QUOTES, 'UTF-8' ), 'description' => $term->description );
			}, array_filter( $terms, function ( $term ) {
				return 'uncategorized' !== $term->slug;
			} ) ) );
		} );
		self::route( '/settings', 'GET', function () {
			return VC_Settings::get();
		} );
		self::route( '/testimonials', 'GET', function () {
			return VC_Testimonials::published();
		} );

		// Checkout.
		self::route( '/promotions/validate', 'POST', function ( $request ) {
			if ( ! VC_Limits::hit( 'promo', VC_Limits::client_ip(), 20, 10 * MINUTE_IN_SECONDS ) ) {
				throw new VC_Http_Error( 'Too many promotion checks. Please wait a few minutes.', 429 );
			}
			$body   = self::json( $request );
			$result = VC_Orders::validate_coupon( $body['code'] ?? '', (float) ( $body['subtotal'] ?? 0 ) );
			unset( $result['coupon'] );
			return $result;
		} );
		self::route( '/orders', 'POST', function ( $request ) {
			return VC_Orders::create( self::json( $request ) );
		} );
		self::route( '/orders/mine', 'GET', function () {
			return VC_Orders::for_user( self::require_customer()->ID );
		} );

		// Vibe AI.
		self::route( '/ai/chat', 'POST', function ( $request ) {
			$body = self::json( $request );
			return VC_AI::chat( $body['message'] ?? '', $body['history'] ?? array() );
		} );

		// Customer accounts.
		self::route( '/auth/login', 'POST', function ( $request ) {
			$body = self::json( $request );
			return VC_Auth::login( $body['email'] ?? '', $body['password'] ?? '' );
		} );
		self::route( '/auth/signup', 'POST', function ( $request ) {
			return VC_Auth::signup( self::json( $request ) );
		} );
		self::route( '/auth/google', 'POST', function ( $request ) {
			$body = self::json( $request );
			return VC_Auth::google( $body['idToken'] ?? ( $body['credential'] ?? '' ) );
		} );
		self::route( '/auth/me', 'GET', function () {
			return VC_Auth::to_api( self::require_customer() );
		} );
		self::route( '/auth/logout', 'POST', function () {
			return VC_Auth::logout();
		} );
		self::route( '/auth/change-password', 'POST', function ( $request ) {
			$body = self::json( $request );
			return VC_Auth::change_password( $body['currentPassword'] ?? '', $body['newPassword'] ?? '' );
		} );
		// Lets the storefront show an "Admin" link to signed-in staff.
		self::route( '/admin/auth/me', 'GET', function () {
			$user = wp_get_current_user();
			if ( ! $user || ! $user->ID || ! VC_Auth::is_staff( $user ) ) {
				throw new VC_Http_Error( 'Not signed in.', 401 );
			}
			return array( 'name' => $user->display_name, 'adminUrl' => admin_url() );
		} );
	}

	/**
	 * Cross-site protection: requests that change something must come from this site
	 * (Origin/Referer). WordPress's REST nonce covers signed-in users; this also covers
	 * sign-in, sign-up and guest checkout.
	 */
	public static function guard( $result, $server, $request ) {
		if ( 0 !== strpos( $request->get_route(), '/' . self::NS . '/' ) || 'GET' === $request->get_method() ) {
			return $result;
		}
		$source = $request->get_header( 'origin' ) ?: $request->get_header( 'referer' );
		if ( $source ) {
			$host = wp_parse_url( $source, PHP_URL_HOST );
			if ( $host && strtolower( $host ) !== strtolower( (string) wp_parse_url( home_url(), PHP_URL_HOST ) ) ) {
				return new WP_REST_Response( array( 'success' => false, 'message' => 'Cross-site request refused.' ), 403 );
			}
		}
		return $result;
	}

	/** Storefront API responses are per visitor: never cache them at the host/CDN. */
	public static function no_cache( $response, $server, $request ) {
		if ( 0 === strpos( $request->get_route(), '/' . self::NS . '/' ) ) {
			$personal = preg_match( '#/(auth|orders|ai|promotions)#', $request->get_route() );
			$response->header( 'Cache-Control', $personal ? 'no-store, private' : 'public, max-age=60' );
		}
		return $response;
	}
}
