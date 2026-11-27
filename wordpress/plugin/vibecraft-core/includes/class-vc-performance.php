<?php
/**
 * Speed and search-engine housekeeping:
 *   - new uploads get WebP versions of every size (much smaller than JPEG/PNG);
 *   - the product list the storefront asks for is cached and refreshed whenever a
 *     product, price or stock level changes;
 *   - utility pages (cart, checkout, account, sign-in) stay out of search results and
 *     the sitemap; duplicate home-page addresses (/about, /contact, /shop) are left out.
 */
defined( 'ABSPATH' ) || exit;

class VC_Performance {
	const CACHE_GROUP_VERSION = 'vc_products_version';
	const PRIVATE_PAGES       = array( 'cart', 'checkout', 'account', 'login', 'signup', 'my-account' );
	const DUPLICATE_PAGES     = array( 'about', 'contact', 'shop', 'home' );

	public static function init() {
		// WebP for image sizes created from new uploads.
		add_filter( 'image_editor_output_format', function ( $formats ) {
			$formats['image/jpeg'] = 'image/webp';
			$formats['image/png']  = 'image/webp';
			return $formats;
		} );

		// The shop never shows images wider than 1200px: skip the 1536/2048px copies
		// WordPress would otherwise make of every upload (saves storage and upload time).
		add_filter( 'intermediate_image_sizes_advanced', function ( $sizes ) {
			unset( $sizes['1536x1536'], $sizes['2048x2048'] );
			return $sizes;
		} );
		add_filter( 'big_image_size_threshold', function () {
			return 2400;
		} );

		// Product cache invalidation.
		foreach ( array( 'woocommerce_update_product', 'woocommerce_new_product', 'woocommerce_delete_product', 'woocommerce_trash_product', 'woocommerce_product_set_stock', 'woocommerce_variation_set_stock', 'woocommerce_product_set_stock_status', 'edited_product_cat', 'created_product_cat', 'delete_product_cat' ) as $hook ) {
			add_action( $hook, array( __CLASS__, 'flush_products' ) );
		}
		add_action( 'save_post_product', array( __CLASS__, 'flush_products' ) );
		add_action( 'updated_post_meta', function ( $meta_id, $post_id, $key ) {
			if ( 0 === strpos( (string) $key, '_vc_' ) && 'product' === get_post_type( $post_id ) ) {
				self::flush_products();
			}
		}, 10, 3 );

		// Search engines.
		add_filter( 'robots_txt', array( __CLASS__, 'robots' ), 20, 2 );
		add_filter( 'wp_sitemaps_posts_query_args', array( __CLASS__, 'sitemap_pages' ), 10, 2 );
		add_filter( 'wp_sitemaps_taxonomies', function ( $taxonomies ) {
			unset( $taxonomies['category'], $taxonomies['post_tag'], $taxonomies['product_tag'], $taxonomies['product_cat'] );
			return $taxonomies;
		} );
		add_filter( 'wp_sitemaps_post_types', function ( $types ) {
			unset( $types['post'] ); // no blog
			return $types;
		} );
		// No blog: its feeds would be empty pages.
		remove_action( 'wp_head', 'feed_links', 2 );
		remove_action( 'wp_head', 'feed_links_extra', 3 );
	}

	public static function cache_key( $args ) {
		return 'vc_products_' . (int) get_option( self::CACHE_GROUP_VERSION, 1 ) . '_' . md5( wp_json_encode( $args ) );
	}

	public static function flush_products() {
		update_option( self::CACHE_GROUP_VERSION, (int) get_option( self::CACHE_GROUP_VERSION, 1 ) + 1, true );
	}

	public static function robots( $output, $public ) {
		if ( ! $public ) {
			return $output;
		}
		$lines = array( 'User-agent: *', 'Disallow: /checkout', 'Disallow: /cart', 'Disallow: /account', 'Disallow: /login', 'Disallow: /signup', 'Disallow: /*?add-to-cart=', 'Allow: /wp-admin/admin-ajax.php', '', 'Sitemap: ' . home_url( '/wp-sitemap.xml' ) );
		return implode( "\n", $lines ) . "\n";
	}

	public static function sitemap_pages( $args, $post_type ) {
		if ( 'page' !== $post_type ) {
			return $args;
		}
		$exclude = array();
		foreach ( array_merge( self::PRIVATE_PAGES, self::DUPLICATE_PAGES ) as $slug ) {
			$page = get_page_by_path( $slug );
			if ( $page && (int) $page->ID !== (int) get_option( 'page_on_front' ) ) {
				$exclude[] = $page->ID;
			}
		}
		$args['post__not_in'] = array_merge( $args['post__not_in'] ?? array(), $exclude );
		return $args;
	}
}
