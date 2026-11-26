<?php
/**
 * WooCommerce → Vibecraft → Import: copies categories, products (with photos), store
 * settings and testimonials from the previous Vibecraft site's API. Products are
 * imported one per request so it never hits the host's time limit, and re-running it
 * updates instead of duplicating.
 */
defined( 'ABSPATH' ) || exit;

class VC_Importer {
	const STATE = 'vc_import_state';

	public static function init() {
		add_action( 'wp_ajax_vc_import_start', array( __CLASS__, 'ajax_start' ) );
		add_action( 'wp_ajax_vc_import_product', array( __CLASS__, 'ajax_product' ) );
	}

	public static function render() {
		$nonce = wp_create_nonce( 'vc_import' );
		?>
		<h2>Import from the previous site</h2>
		<p>Copies categories, products (with photos), store settings and testimonials. Orders and customer accounts are not copied. Safe to run again: existing products are updated, not duplicated.</p>
		<table class="form-table"><tbody><tr><th><label for="vc-import-source">Previous site's API address</label></th>
		<td><input type="url" class="regular-text" id="vc-import-source" value="https://vibecraft-0ecf.onrender.com/api"><p class="description">The address ending in <code>/api</code>.</p></td></tr>
		<tr><th>Also import</th><td><label><input type="checkbox" id="vc-import-settings" checked> Store settings (phone, paybill, delivery fees…)</label><br><label><input type="checkbox" id="vc-import-testimonials" checked> Testimonials</label></td></tr></tbody></table>
		<p><button type="button" class="button button-primary" id="vc-import-run">Start import</button></p>
		<pre id="vc-import-log" style="background:#fff;border:1px solid #ccd0d4;padding:12px;max-height:360px;overflow:auto;white-space:pre-wrap"></pre>
		<script>
		(function () {
			var log = document.getElementById('vc-import-log');
			var button = document.getElementById('vc-import-run');
			function line(text) { log.textContent += text + "\n"; log.scrollTop = log.scrollHeight; }
			function call(action, data) {
				var body = new URLSearchParams(Object.assign({ action: action, _ajax_nonce: <?php echo wp_json_encode( $nonce ); ?> }, data));
				return fetch(ajaxurl, { method: 'POST', credentials: 'same-origin', body: body }).then(function (r) { return r.json(); });
			}
			button.addEventListener('click', async function () {
				button.disabled = true; log.textContent = '';
				line('Reading the previous site…');
				var start = await call('vc_import_start', {
					source: document.getElementById('vc-import-source').value,
					settings: document.getElementById('vc-import-settings').checked ? 1 : 0,
					testimonials: document.getElementById('vc-import-testimonials').checked ? 1 : 0
				});
				if (!start.success) { line('Stopped: ' + (start.data || 'unknown error')); button.disabled = false; return; }
				(start.data.notes || []).forEach(line);
				for (var i = 0; i < start.data.count; i++) {
					var result = await call('vc_import_product', { index: i });
					line((i + 1) + '/' + start.data.count + '  ' + (result.success ? result.data : 'FAILED: ' + result.data));
				}
				line('Done.');
				button.disabled = false;
			});
		})();
		</script>
		<?php
	}

	private static function check() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_send_json_error( 'Not allowed.', 403 );
		}
		check_ajax_referer( 'vc_import' );
	}

	private static function fetch( $base, $path ) {
		$response = wp_remote_get( trailingslashit( $base ) . $path, array( 'timeout' => 30 ) );
		if ( is_wp_error( $response ) ) {
			throw new Exception( $path . ': ' . $response->get_error_message() );
		}
		$body = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( 200 !== wp_remote_retrieve_response_code( $response ) || ! is_array( $body ) || empty( $body['success'] ) ) {
			throw new Exception( $path . ': unexpected response (HTTP ' . wp_remote_retrieve_response_code( $response ) . ')' );
		}
		return $body['data'];
	}

	public static function ajax_start() {
		self::check();
		$source = esc_url_raw( wp_unslash( $_POST['source'] ?? '' ) );
		try {
			wp_send_json_success( self::start( $source, ! empty( $_POST['settings'] ), ! empty( $_POST['testimonials'] ) ) );
		} catch ( Exception $error ) {
			wp_send_json_error( $error->getMessage() );
		}
	}

	/** Reads the previous site, sets up categories/settings/testimonials, queues products. */
	public static function start( $source, $with_settings = true, $with_testimonials = true ) {
		if ( ! $source || ! wp_http_validate_url( $source ) ) {
			throw new Exception( 'Enter the previous site\'s API address.' );
		}
		$notes      = array();
		$categories = self::fetch( $source, 'categories' );
		$products   = self::fetch( $source, 'products' );
		foreach ( $categories as $category ) {
			$slug = sanitize_title( $category['id'] );
			$term = get_term_by( 'slug', $slug, 'product_cat' );
			$args = array( 'slug' => $slug, 'description' => (string) ( $category['description'] ?? '' ) );
			if ( $term ) {
				wp_update_term( $term->term_id, 'product_cat', array_merge( $args, array( 'name' => $category['name'] ) ) );
			} else {
				wp_insert_term( $category['name'], 'product_cat', $args );
			}
		}
		$notes[] = count( $categories ) . ' categories ready.';

		if ( $with_settings ) {
			$settings = self::fetch( $source, 'settings' );
			VC_Settings::update( array_intersect_key( $settings, array_flip( array_keys( VC_Settings::defaults() ) ) ) );
			$notes[] = 'Store settings imported.';
		}
		if ( $with_testimonials ) {
			$count = 0;
			foreach ( self::fetch( $source, 'testimonials' ) as $item ) {
				$existing = get_posts( array( 'post_type' => VC_Testimonials::TYPE, 'meta_key' => '_vc_legacy_id', 'meta_value' => (string) $item['id'], 'post_status' => 'any', 'fields' => 'ids', 'posts_per_page' => 1 ) );
				$post_id  = wp_insert_post( array(
					'ID'           => $existing ? $existing[0] : 0,
					'post_type'    => VC_Testimonials::TYPE,
					'post_status'  => ! empty( $item['isPublished'] ) ? 'publish' : 'draft',
					'post_title'   => sanitize_text_field( $item['clientName'] ?? 'Customer' ),
					'post_content' => sanitize_textarea_field( $item['quote'] ?? '' ),
					'menu_order'   => (int) ( $item['sortOrder'] ?? 0 ),
				) );
				update_post_meta( $post_id, '_vc_legacy_id', (string) $item['id'] );
				update_post_meta( $post_id, '_vc_location', sanitize_text_field( $item['clientLocation'] ?? '' ) );
				update_post_meta( $post_id, '_vc_video_url', esc_url_raw( $item['videoUrl'] ?? '' ) );
				update_post_meta( $post_id, '_vc_poster_url', esc_url_raw( $item['posterUrl'] ?? '' ) );
				$count++;
			}
			$notes[] = $count . ' testimonials imported.';
		}
		update_option( self::STATE, array( 'products' => $products ), false );
		$notes[] = 'Importing ' . count( $products ) . ' products (photos are downloaded, so this takes a minute)…';
		return array( 'count' => count( $products ), 'notes' => $notes );
	}

	public static function ajax_product() {
		self::check();
		$state = get_option( self::STATE );
		$index = (int) ( $_POST['index'] ?? -1 );
		if ( empty( $state['products'][ $index ] ) ) {
			wp_send_json_error( 'Nothing to import at this position.' );
		}
		try {
			wp_send_json_success( self::import_product( $state['products'][ $index ], $index ) );
		} catch ( Exception $error ) {
			wp_send_json_error( $error->getMessage() );
		}
	}

	public static function import_product( array $item, $position = 0 ) {
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';
		@set_time_limit( 120 ); // phpcs:ignore WordPress.PHP.NoSilencedErrors

		$legacy   = (string) $item['id'];
		$existing = get_posts( array( 'post_type' => 'product', 'post_status' => 'any', 'meta_key' => '_vc_legacy_id', 'meta_value' => $legacy, 'fields' => 'ids', 'posts_per_page' => 1 ) );
		$product  = $existing ? wc_get_product( $existing[0] ) : new WC_Product_Simple();

		$price   = (float) $item['price'];
		$compare = isset( $item['compareAtPrice'] ) ? (float) $item['compareAtPrice'] : 0;
		$product->set_name( $item['name'] );
		$product->set_slug( sanitize_title( $item['slug'] ?: $item['name'] ) );
		$product->set_status( 'publish' );
		$product->set_regular_price( (string) ( $compare > $price ? $compare : $price ) );
		$product->set_sale_price( $compare > $price ? (string) $price : '' );
		$product->set_manage_stock( true );
		$product->set_stock_quantity( max( 0, (int) $item['stock'] ) );
		$product->set_featured( ! empty( $item['featured'] ) );
		// Keep the previous site's display order.
		$product->set_menu_order( (int) $position );
		$product->set_short_description( (string) ( $item['shortSummary'] ?? '' ) );
		$product->set_description( ! empty( $item['detailedDescription'] ) ? wp_kses_post( $item['detailedDescription'] ) : wpautop( esc_html( (string) $item['description'] ) ) );
		$term = get_term_by( 'slug', sanitize_title( (string) $item['categoryId'] ), 'product_cat' );
		if ( $term ) {
			$product->set_category_ids( array( $term->term_id ) );
		}

		// Photos: downloaded into the media library once, reused on later imports.
		$attachment_ids = array();
		foreach ( (array) ( $item['images'] ?? array() ) as $url ) {
			$id = self::sideload( $url, $item['name'] );
			if ( $id ) {
				$attachment_ids[] = $id;
			}
		}
		$photo_count = count( $attachment_ids );
		if ( $attachment_ids ) {
			$product->set_image_id( array_shift( $attachment_ids ) );
			$product->set_gallery_image_ids( $attachment_ids );
		}
		$id = $product->save();

		update_post_meta( $id, '_vc_legacy_id', $legacy );
		update_post_meta( $id, '_vc_plain_description', (string) $item['description'] );
		update_post_meta( $id, '_vc_brand', (string) ( $item['brand'] ?? '' ) );
		update_post_meta( $id, '_vc_resolution', (string) ( $item['resolution'] ?? '' ) );
		update_post_meta( $id, '_vc_brightness', (string) ( $item['brightness'] ?? '' ) );
		update_post_meta( $id, '_vc_ansi_lumens', null === ( $item['ansiLumens'] ?? null ) ? '' : (string) (int) $item['ansiLumens'] );
		update_post_meta( $id, '_vc_projector_type', (string) ( $item['projectorType'] ?? '' ) );
		update_post_meta( $id, '_vc_smart_os', ! empty( $item['smartOS'] ) ? 'yes' : 'no' );
		update_post_meta( $id, '_vc_wifi', ! empty( $item['wifi'] ) ? 'yes' : 'no' );
		update_post_meta( $id, '_vc_bluetooth', ! empty( $item['bluetooth'] ) ? 'yes' : 'no' );
		update_post_meta( $id, '_vc_whats_in_box', VC_Products::lines( $item['whatsInBox'] ?? array() ) );
		update_post_meta( $id, '_vc_ideal_use_cases', VC_Products::lines( $item['idealUseCases'] ?? array() ) );
		update_post_meta( $id, '_vc_reviews', is_array( $item['reviews'] ?? null ) ? $item['reviews'] : array() );
		$specs  = is_array( $item['specs'] ?? null ) ? $item['specs'] : array();
		$videos = isset( $specs['videos'] ) ? array_values( array_filter( array_map( 'esc_url_raw', (array) $specs['videos'] ) ) ) : array();
		unset( $specs['videos'], $specs['sourceUrl'], $specs['sourceProductId'] );
		foreach ( array( 'cardMobileImage', 'cardDesktopImage' ) as $key ) {
			if ( ! empty( $specs[ $key ] ) ) {
				$attachment = self::sideload( $specs[ $key ], $item['name'] );
				$specs[ $key ] = $attachment ? wp_get_attachment_url( $attachment ) : $specs[ $key ];
			}
		}
		update_post_meta( $id, '_vc_specs', $specs );
		update_post_meta( $id, '_vc_videos', $videos );

		return ( $existing ? 'Updated ' : 'Created ' ) . $item['name'] . ' (' . $photo_count . ' photos)';
	}

	private static function sideload( $url, $title ) {
		$url = esc_url_raw( (string) $url );
		if ( ! $url || preg_match( '/\.(mp4|webm|mov)(\?|$)/i', $url ) ) {
			return 0;
		}
		$found = get_posts( array( 'post_type' => 'attachment', 'post_status' => 'inherit', 'meta_key' => '_vc_source_url', 'meta_value' => $url, 'fields' => 'ids', 'posts_per_page' => 1 ) );
		if ( $found ) {
			return (int) $found[0];
		}
		$tmp = download_url( $url, 60 );
		if ( is_wp_error( $tmp ) ) {
			return 0;
		}
		$name = basename( wp_parse_url( $url, PHP_URL_PATH ) );
		if ( ! preg_match( '/\.(jpe?g|png|gif|webp|avif)$/i', $name ) ) {
			$name .= '.jpg';
		}
		$id = media_handle_sideload( array( 'name' => $name, 'tmp_name' => $tmp ), 0, $title );
		if ( is_wp_error( $id ) ) {
			@unlink( $tmp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
			return 0;
		}
		update_post_meta( $id, '_vc_source_url', $url );
		return (int) $id;
	}
}
