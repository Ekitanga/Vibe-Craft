<?php
/**
 * Products: projector fields on the WooCommerce product screen, and the product shape
 * the storefront scripts expect (identical to the previous site's API).
 */
defined( 'ABSPATH' ) || exit;

class VC_Products {
	const TEXT_FIELDS = array(
		'_vc_brand'          => 'Brand',
		'_vc_resolution'     => 'Resolution',
		'_vc_brightness'     => 'Brightness',
		'_vc_ansi_lumens'    => 'ANSI lumens (number)',
		'_vc_projector_type' => 'Projector type (home, portable, office, outdoor…)',
	);
	const FLAG_FIELDS = array(
		'_vc_smart_os'  => 'Smart OS',
		'_vc_wifi'      => 'Wi-Fi',
		'_vc_bluetooth' => 'Bluetooth',
	);
	const LIST_FIELDS = array(
		'_vc_whats_in_box'     => "What's in the box (one per line)",
		'_vc_ideal_use_cases'  => 'Ideal for (one per line)',
		'_vc_videos'           => 'Product videos (one URL per line)',
	);
	// Spec keys shown on the product page, in this order.
	const SPEC_KEYS = array( 'resolution', 'brightness', 'operatingSystem', 'connectivity', 'projectionSize', 'speakerAudio', 'throwRatio', 'lightSource', 'warranty' );

	public static function init() {
		add_action( 'add_meta_boxes', array( __CLASS__, 'add_meta_box' ) );
		add_action( 'woocommerce_process_product_meta', array( __CLASS__, 'save_meta_box' ) );
		// Product pages live at /products/<slug>/ (set on activation); keep old ?id links working.
		add_action( 'template_redirect', array( __CLASS__, 'redirect_legacy_links' ) );
	}

	// ---- Storefront shape ------------------------------------------------------------
	public static function to_api( $product ) {
		if ( ! $product instanceof WC_Product ) {
			$product = wc_get_product( $product );
		}
		if ( ! $product ) {
			return null;
		}
		$id      = $product->get_id();
		$price   = (float) $product->get_price();
		$regular = (float) $product->get_regular_price();
		$compare = ( $product->is_on_sale() && $regular > $price ) ? $regular : null;

		$images = array();
		$ids    = array_filter( array_merge( array( $product->get_image_id() ), $product->get_gallery_image_ids() ) );
		foreach ( $ids as $attachment_id ) {
			$url = wp_get_attachment_url( $attachment_id );
			if ( $url ) {
				$images[] = $url;
			}
		}

		$specs = get_post_meta( $id, '_vc_specs', true );
		$specs = is_array( $specs ) ? $specs : array();
		foreach ( array( 'resolution' => '_vc_resolution', 'brightness' => '_vc_brightness' ) as $spec => $meta ) {
			$value = get_post_meta( $id, $meta, true );
			if ( '' !== $value && empty( $specs[ $spec ] ) ) {
				$specs[ $spec ] = $value;
			}
		}
		$videos = self::lines( get_post_meta( $id, '_vc_videos', true ) );
		if ( $videos ) {
			$specs['videos'] = $videos;
		}

		$plain = get_post_meta( $id, '_vc_plain_description', true );
		if ( '' === $plain ) {
			$plain = trim( wp_strip_all_tags( $product->get_description() ) );
		}
		$stock = $product->managing_stock() ? (int) $product->get_stock_quantity() : ( $product->is_in_stock() ? 99 : 0 );

		$reviews = get_post_meta( $id, '_vc_reviews', true );

		return array(
			'id'                  => (string) $id,
			'slug'                => $product->get_slug(),
			'name'                => html_entity_decode( $product->get_name(), ENT_QUOTES, 'UTF-8' ),
			'brand'               => get_post_meta( $id, '_vc_brand', true ) ?: null,
			'categoryId'          => self::category_slug( $id ),
			'price'               => $price,
			'compareAtPrice'      => $compare,
			'currency'            => get_woocommerce_currency(),
			'stock'               => max( 0, $stock ),
			'featured'            => $product->is_featured(),
			'description'         => $plain ?: $product->get_name(),
			'shortSummary'        => trim( wp_strip_all_tags( $product->get_short_description() ) ) ?: null,
			'detailedDescription' => $product->get_description() ?: null,
			'resolution'          => get_post_meta( $id, '_vc_resolution', true ) ?: null,
			'brightness'          => get_post_meta( $id, '_vc_brightness', true ) ?: null,
			'ansiLumens'          => ( '' !== get_post_meta( $id, '_vc_ansi_lumens', true ) ) ? (int) get_post_meta( $id, '_vc_ansi_lumens', true ) : null,
			'projectorType'       => get_post_meta( $id, '_vc_projector_type', true ) ?: null,
			'smartOS'             => 'yes' === get_post_meta( $id, '_vc_smart_os', true ),
			'wifi'                => 'yes' === get_post_meta( $id, '_vc_wifi', true ),
			'bluetooth'           => 'yes' === get_post_meta( $id, '_vc_bluetooth', true ),
			'bestSellingRank'     => (int) $product->get_menu_order(),
			'createdAt'           => $product->get_date_created() ? $product->get_date_created()->date( DATE_ATOM ) : null,
			'updatedAt'           => $product->get_date_modified() ? $product->get_date_modified()->date( DATE_ATOM ) : null,
			'images'              => $images,
			'specs'               => (object) $specs,
			'whatsInBox'          => self::lines( get_post_meta( $id, '_vc_whats_in_box', true ) ),
			'idealUseCases'       => self::lines( get_post_meta( $id, '_vc_ideal_use_cases', true ) ),
			'reviews'             => is_array( $reviews ) ? $reviews : array(),
			'url'                 => get_permalink( $id ),
			// The product ID Meta's plugin uses for the Pixel and catalog, so browser
			// events (AddToCart) match the catalog.
			'metaContentId'       => self::meta_content_id( $product ),
		);
	}

	public static function meta_content_id( $product ) {
		if ( class_exists( 'WC_Facebookcommerce_Utils' ) && method_exists( 'WC_Facebookcommerce_Utils', 'get_fb_retailer_id' ) ) {
			return (string) WC_Facebookcommerce_Utils::get_fb_retailer_id( $product );
		}
		return (string) $product->get_id();
	}

	public static function category_slug( $id ) {
		$terms = get_the_terms( $id, 'product_cat' );
		if ( ! $terms || is_wp_error( $terms ) ) {
			return null;
		}
		foreach ( $terms as $term ) {
			if ( 'uncategorized' !== $term->slug ) {
				return $term->slug;
			}
		}
		return $terms[0]->slug;
	}

	public static function lines( $value ) {
		if ( is_array( $value ) ) {
			return array_values( array_filter( array_map( 'trim', $value ) ) );
		}
		return array_values( array_filter( array_map( 'trim', preg_split( '/\r\n|\r|\n/', (string) $value ) ) ) );
	}

	/** Published products, in display order. */
	public static function query( $args = array() ) {
		$query = array(
			'status'  => 'publish',
			'limit'   => 200,
			'orderby' => array( 'menu_order' => 'ASC', 'date' => 'DESC' ),
			'return'  => 'objects',
		);
		if ( ! empty( $args['category'] ) ) {
			$query['category'] = array( sanitize_title( $args['category'] ) );
		}
		if ( isset( $args['featured'] ) && '' !== $args['featured'] ) {
			$query['featured'] = filter_var( $args['featured'], FILTER_VALIDATE_BOOLEAN );
		}
		return array_values( array_filter( array_map( array( __CLASS__, 'to_api' ), wc_get_products( $query ) ) ) );
	}

	/** Find by WooCommerce ID, slug or the previous site's ID. */
	public static function find( $key ) {
		$key = trim( (string) $key );
		if ( '' === $key || strlen( $key ) > 200 ) {
			return null;
		}
		if ( ctype_digit( $key ) ) {
			$product = wc_get_product( (int) $key );
			if ( $product && 'publish' === $product->get_status() ) {
				return $product;
			}
		}
		$post = get_page_by_path( sanitize_title( $key ), OBJECT, 'product' );
		if ( $post && 'publish' === $post->post_status ) {
			return wc_get_product( $post->ID );
		}
		$legacy = get_posts( array(
			'post_type'      => 'product',
			'post_status'    => 'publish',
			'meta_key'       => '_vc_legacy_id',
			'meta_value'     => $key,
			'posts_per_page' => 1,
			'fields'         => 'ids',
		) );
		return $legacy ? wc_get_product( $legacy[0] ) : null;
	}

	/** /product?id=<old id> and /products/<old id> → the product's page (keeps utm/fbclid). */
	public static function redirect_legacy_links() {
		$path = trim( (string) wp_parse_url( isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '', PHP_URL_PATH ), '/' );
		$key  = '';
		if ( 'product' === $path && isset( $_GET['id'] ) ) {
			$key = sanitize_text_field( wp_unslash( $_GET['id'] ) );
		} elseif ( is_404() && preg_match( '#^products?/([^/]+)$#', $path, $match ) ) {
			// /products/<id or old id>, and the old WooCommerce address /product/<old-name>/.
			$key = rawurldecode( $match[1] );
			if ( ! self::find( $key ) ) {
				$renamed = get_posts( array( 'post_type' => 'product', 'post_status' => 'publish', 'meta_key' => '_wp_old_slug', 'meta_value' => sanitize_title( $key ), 'fields' => 'ids', 'posts_per_page' => 1 ) );
				if ( $renamed ) {
					$key = (string) $renamed[0];
				}
			}
		} elseif ( is_404() && preg_match( '#^product-category/([^/]+)#', $path, $match ) ) {
			wp_safe_redirect( home_url( '/shop' ), 301 );
			exit;
		} elseif ( 'product' === $path ) {
			wp_safe_redirect( home_url( '/shop/' ), 301 );
			exit;
		}
		if ( '' === $key ) {
			return;
		}
		$product = self::find( $key );
		if ( ! $product ) {
			return;
		}
		$params = $_GET; // phpcs:ignore WordPress.Security.NonceVerification
		unset( $params['id'] );
		$url = get_permalink( $product->get_id() );
		if ( $params ) {
			$url = add_query_arg( array_map( 'sanitize_text_field', wp_unslash( $params ) ), $url );
		}
		wp_safe_redirect( $url, 301 );
		exit;
	}

	// ---- Product edit screen ---------------------------------------------------------
	public static function add_meta_box() {
		add_meta_box( 'vc_product_details', 'Vibecraft product details', array( __CLASS__, 'render_meta_box' ), 'product', 'normal', 'high' );
	}

	public static function render_meta_box( $post ) {
		wp_nonce_field( 'vc_product_meta', 'vc_product_meta_nonce' );
		echo '<p>The short summary is the product\'s <strong>Product short description</strong> (below). The main description is the big editor above.</p>';
		echo '<table class="form-table"><tbody>';
		foreach ( self::TEXT_FIELDS as $key => $label ) {
			printf(
				'<tr><th><label for="%1$s">%2$s</label></th><td><input type="text" class="regular-text" id="%1$s" name="%1$s" value="%3$s"></td></tr>',
				esc_attr( $key ),
				esc_html( $label ),
				esc_attr( get_post_meta( $post->ID, $key, true ) )
			);
		}
		echo '<tr><th>Features</th><td>';
		foreach ( self::FLAG_FIELDS as $key => $label ) {
			printf(
				'<label style="margin-right:16px"><input type="checkbox" name="%1$s" value="yes" %3$s> %2$s</label>',
				esc_attr( $key ),
				esc_html( $label ),
				checked( 'yes', get_post_meta( $post->ID, $key, true ), false )
			);
		}
		echo '</td></tr>';
		$specs = get_post_meta( $post->ID, '_vc_specs', true );
		$specs = is_array( $specs ) ? $specs : array();
		$lines = array();
		foreach ( $specs as $key => $value ) {
			if ( is_scalar( $value ) && ! in_array( $key, array( 'cardMobileImage', 'cardDesktopImage', 'sourceUrl', 'sourceProductId' ), true ) ) {
				$lines[] = $key . ': ' . $value;
			}
		}
		printf(
			'<tr><th><label for="vc_specs">Specifications</label></th><td><textarea id="vc_specs" name="vc_specs" rows="6" class="large-text" placeholder="operatingSystem: Android 13&#10;projectionSize: 40–200 inches">%s</textarea><p class="description">One per line as <code>name: value</code>. Known names: %s.</p></td></tr>',
			esc_textarea( implode( "\n", $lines ) ),
			esc_html( implode( ', ', self::SPEC_KEYS ) )
		);
		foreach ( self::LIST_FIELDS as $key => $label ) {
			printf(
				'<tr><th><label for="%1$s">%2$s</label></th><td><textarea id="%1$s" name="%1$s" rows="4" class="large-text">%3$s</textarea></td></tr>',
				esc_attr( $key ),
				esc_html( $label ),
				esc_textarea( implode( "\n", self::lines( get_post_meta( $post->ID, $key, true ) ) ) )
			);
		}
		echo '</tbody></table>';
	}

	public static function save_meta_box( $post_id ) {
		if ( ! isset( $_POST['vc_product_meta_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['vc_product_meta_nonce'] ) ), 'vc_product_meta' ) ) {
			return;
		}
		if ( ! current_user_can( 'edit_product', $post_id ) ) {
			return;
		}
		foreach ( array_keys( self::TEXT_FIELDS ) as $key ) {
			update_post_meta( $post_id, $key, sanitize_text_field( wp_unslash( $_POST[ $key ] ?? '' ) ) );
		}
		foreach ( array_keys( self::FLAG_FIELDS ) as $key ) {
			update_post_meta( $post_id, $key, isset( $_POST[ $key ] ) ? 'yes' : 'no' );
		}
		foreach ( array_keys( self::LIST_FIELDS ) as $key ) {
			$lines = self::lines( sanitize_textarea_field( wp_unslash( $_POST[ $key ] ?? '' ) ) );
			if ( '_vc_videos' === $key ) {
				$lines = array_values( array_filter( array_map( 'esc_url_raw', $lines ) ) );
			}
			update_post_meta( $post_id, $key, $lines );
		}
		$existing = get_post_meta( $post_id, '_vc_specs', true );
		$specs    = array();
		// Keep image overrides set by the import (not editable here).
		foreach ( array( 'cardMobileImage', 'cardDesktopImage' ) as $keep ) {
			if ( is_array( $existing ) && ! empty( $existing[ $keep ] ) ) {
				$specs[ $keep ] = $existing[ $keep ];
			}
		}
		foreach ( self::lines( sanitize_textarea_field( wp_unslash( $_POST['vc_specs'] ?? '' ) ) ) as $line ) {
			$parts = explode( ':', $line, 2 );
			if ( 2 === count( $parts ) && '' !== trim( $parts[0] ) && '' !== trim( $parts[1] ) ) {
				$specs[ preg_replace( '/[^A-Za-z0-9_]/', '', trim( $parts[0] ) ) ] = trim( $parts[1] );
			}
		}
		update_post_meta( $post_id, '_vc_specs', $specs );
		// The plain-text description is regenerated from the editor content.
		delete_post_meta( $post_id, '_vc_plain_description' );
	}
}
