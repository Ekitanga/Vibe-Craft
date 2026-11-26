<?php
/**
 * Store settings (WooCommerce → Vibecraft). Public values feed the storefront; private
 * values (API keys) never leave the server.
 */
defined( 'ABSPATH' ) || exit;

class VC_Settings {
	const OPTION  = 'vc_settings';
	const PRIVATE = 'vc_private';

	public static function fee_bands() {
		return array(
			0    => array( 'Nairobi' ),
			300  => array( 'Kiambu' ),
			600  => array( 'Kajiado', 'Machakos', "Murang'a" ),
			900  => array( 'Embu', 'Kirinyaga', 'Makueni', 'Nakuru', 'Nyeri', 'Nyandarua' ),
			1200 => array( 'Baringo', 'Bomet', 'Elgeyo-Marakwet', 'Kericho', 'Laikipia', 'Nandi', 'Samburu', 'Tharaka-Nithi' ),
			1500 => array( 'Bungoma', 'Busia', 'Homa Bay', 'Isiolo', 'Kakamega', 'Kisii', 'Kisumu', 'Kitui', 'Migori', 'Nyamira', 'Siaya', 'Taita-Taveta', 'Trans Nzoia', 'Uasin Gishu', 'Vihiga', 'West Pokot' ),
			1800 => array( 'Garissa', 'Kilifi', 'Kwale', 'Lamu', 'Tana River' ),
			2000 => array( 'Mombasa' ),
			2500 => array( 'Mandera', 'Marsabit', 'Meru', 'Turkana', 'Wajir' ),
		);
	}

	public static function default_fees() {
		$fees = array();
		foreach ( self::fee_bands() as $amount => $counties ) {
			foreach ( $counties as $county ) {
				$fees[ $county ] = (int) $amount;
			}
		}
		ksort( $fees );
		return $fees;
	}

	public static function defaults() {
		$fees = self::default_fees();
		return array(
			'storeName'            => 'Vibecraft',
			'tagline'              => 'Big picture energy, made practical.',
			'heroTitle'            => 'See more in every room.',
			'heroDescription'      => 'Thoughtful projector setups for movie nights, big ideas, and shared moments.',
			'phone'                => '0758657001',
			'whatsapp'             => '0758657001',
			'contactEmail'         => '',
			'paybill'              => '522533',
			'mpesaAccount'         => '8055906',
			'address'              => 'Rasumal House, 4th floor, Shop 14',
			'openingHours'         => 'Monday to Saturday: 8:00 AM – 7:00 PM',
			'announcement'         => '',
			'primaryColor'         => '#cc3355',
			'accentColor'          => '#ffd2d5',
			'lowStockThreshold'    => 5,
			'deliveryFees'         => $fees,
			'deliveryAvailability' => array_fill_keys( array_keys( $fees ), true ),
			'socialLinks'          => array(
				'instagram' => 'https://www.instagram.com/vibecraft254',
				'tiktok'    => 'https://www.tiktok.com/@vibecraft254',
				'facebook'  => '',
				'youtube'   => '',
			),
			'freeDeliveryMinimum'  => 0,
		);
	}

	public static function private_defaults() {
		return array(
			'geminiApiKey'          => '',
			'geminiModel'           => 'gemini-2.5-flash-lite',
			'googleClientId'        => '',
			'ordersPerHourPerIp'    => 8,
			'pendingOrdersPerPhone' => 3,
			'aiMessagesPer5Min'     => 20,
			'loginAttempts'         => 8,
			'signupsPerHourPerIp'   => 10,
		);
	}

	/** Public store settings (what GET /settings returns). */
	public static function get() {
		$saved = get_option( self::OPTION, array() );
		$all   = array_merge( self::defaults(), is_array( $saved ) ? $saved : array() );
		if ( empty( $all['deliveryFees'] ) || ! is_array( $all['deliveryFees'] ) ) {
			$all['deliveryFees'] = self::default_fees();
		}
		foreach ( array_keys( $all['deliveryFees'] ) as $county ) {
			if ( ! isset( $all['deliveryAvailability'][ $county ] ) ) {
				$all['deliveryAvailability'][ $county ] = true;
			}
		}
		$all['lowStockThreshold']   = (int) $all['lowStockThreshold'];
		$all['freeDeliveryMinimum'] = (float) $all['freeDeliveryMinimum'];
		return $all;
	}

	public static function update( array $values ) {
		$current = self::get();
		update_option( self::OPTION, array_merge( $current, $values ), false );
	}

	public static function get_private( $key = null ) {
		$saved = get_option( self::PRIVATE, array() );
		$all   = array_merge( self::private_defaults(), is_array( $saved ) ? $saved : array() );
		return null === $key ? $all : ( $all[ $key ] ?? null );
	}

	public static function update_private( array $values ) {
		update_option( self::PRIVATE, array_merge( self::get_private(), $values ), false );
	}

	/** The Google sign-in client ID is public by design (it identifies the site to Google). */
	public static function google_client_id() {
		return (string) self::get_private( 'googleClientId' );
	}

	public static function delivery_fee( $county, $subtotal ) {
		$settings = self::get();
		$min      = (float) $settings['freeDeliveryMinimum'];
		if ( $min > 0 && (float) $subtotal >= $min ) {
			return 0;
		}
		$county = trim( (string) $county );
		if ( isset( $settings['deliveryAvailability'][ $county ] ) && false === $settings['deliveryAvailability'][ $county ] ) {
			return 0;
		}
		return (float) ( $settings['deliveryFees'][ $county ] ?? 0 );
	}

	public static function delivers_to( $county ) {
		$settings = self::get();
		$county   = trim( (string) $county );
		return array_key_exists( $county, $settings['deliveryFees'] ) && false !== ( $settings['deliveryAvailability'][ $county ] ?? true );
	}
}
