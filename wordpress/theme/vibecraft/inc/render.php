<?php
/**
 * Renders the approved storefront pages (html/*.html) inside WordPress:
 *   - images, styles and scripts point at the theme;
 *   - page links use the site's clean addresses (/cart, /about, /products/<slug>);
 *   - WordPress/plugin hooks (wp_head, wp_footer) are added, so Meta's plugin, SEO
 *     plugins and the admin bar work;
 *   - product pages get share-preview tags; the order confirmation gets its receipt.
 * The markup itself is not changed, so the pages look exactly as approved.
 */
defined( 'ABSPATH' ) || exit;

class VC_Theme {
	private static $view = null;

	const PAGE_LINKS = array(
		'index.html#top'        => '/',
		'index.html#about'      => '/about',
		'index.html#contact'    => '/contact',
		'index.html#collection' => '/shop',
		'index.html'            => '/',
		'cart.html'             => '/cart',
		'login.html'            => '/login',
		'signup.html'           => '/signup',
		'account.html'          => '/account',
		'product.html'          => '/shop',
		'find-your-setup.html'  => '/find-your-setup',
	);

	/** /cart.html, /index.html#about … (used by the page scripts) → the clean address. */
	public static function redirect_html_addresses() {
		$path = (string) wp_parse_url( isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '', PHP_URL_PATH );
		if ( ! preg_match( '#/([a-z0-9-]+\.html)$#i', $path, $m ) ) {
			return;
		}
		$file = strtolower( $m[1] );
		if ( 0 === strpos( $file, 'admin' ) ) {
			wp_safe_redirect( admin_url(), 302 );
			exit;
		}
		if ( ! isset( self::PAGE_LINKS[ $file ] ) ) {
			return;
		}
		$query = isset( $_SERVER['QUERY_STRING'] ) ? (string) wp_unslash( $_SERVER['QUERY_STRING'] ) : '';
		$target = home_url( self::PAGE_LINKS[ $file ] );
		if ( 'product.html' === $file && class_exists( 'VC_Products' ) ) {
			parse_str( $query, $params );
			$product = ! empty( $params['id'] ) ? VC_Products::find( sanitize_text_field( $params['id'] ) ) : null;
			if ( $product ) {
				unset( $params['id'] );
				$target = get_permalink( $product->get_id() );
				$query  = http_build_query( $params );
			}
		}
		wp_safe_redirect( $target . ( $query ? '?' . $query : '' ), 301 );
		exit;
	}

	/** Picks the storefront page for the current request. */
	public static function template( $template ) {
		if ( is_admin() || ! function_exists( 'WC' ) ) {
			return $template;
		}
		self::$view = self::decide();
		return get_template_directory() . '/index.php';
	}

	private static function decide() {
		if ( function_exists( 'is_wc_endpoint_url' ) && is_wc_endpoint_url( 'order-received' ) ) {
			return 'receipt';
		}
		if ( is_front_page() || is_home() || is_shop() || is_product_taxonomy() || is_page( array( 'about', 'contact', 'shop' ) ) ) {
			return 'index.html';
		}
		if ( is_product() ) {
			return 'product.html';
		}
		if ( is_page( 'cart' ) ) {
			return 'cart.html';
		}
		if ( is_page( 'login' ) ) {
			return 'login.html';
		}
		if ( is_page( 'signup' ) ) {
			return 'signup.html';
		}
		if ( is_page( 'find-your-setup' ) ) {
			return 'find-your-setup.html';
		}
		if ( is_page( 'account' ) && ! is_wc_endpoint_url() ) {
			return 'account.html';
		}
		return is_404() ? 'not-found' : 'shell';
	}

	public static function is_designed_page() {
		if ( null === self::$view ) {
			self::$view = self::decide();
		}
		return ! in_array( self::$view, array( 'shell' ), true );
	}

	/** Called from index.php. */
	public static function output() {
		$view = self::$view ?? self::decide();
		if ( 'receipt' === $view ) {
			self::receipt();
		} elseif ( 'shell' === $view || 'not-found' === $view ) {
			self::shell( 'not-found' === $view );
		} elseif ( 'product.html' === $view ) {
			self::product();
		} else {
			echo self::render( $view ); // phpcs:ignore WordPress.Security.EscapeOutput -- full page markup
		}
	}

	// ---- Pages -----------------------------------------------------------------------
	private static function product() {
		global $product;
		$product = wc_get_product( get_queried_object_id() );
		$data    = class_exists( 'VC_Products' ) ? VC_Products::to_api( $product ) : null;
		// Meta's plugin reports ViewContent (browser + server) from this WooCommerce hook.
		ob_start();
		do_action( 'woocommerce_after_single_product' );
		$footer = ob_get_clean();
		$title  = $data ? self::store_name() . ' — ' . $data['name'] : '';
		echo self::render( 'product.html', array( 'title' => $title, 'product' => $data, 'footer' => $footer ) ); // phpcs:ignore WordPress.Security.EscapeOutput
	}

	private static function receipt() {
		$order_id = absint( get_query_var( 'order-received' ) );
		$order    = $order_id ? wc_get_order( $order_id ) : null;
		$key      = isset( $_GET['key'] ) ? wc_clean( wp_unslash( $_GET['key'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
		if ( ! $order || ! hash_equals( $order->get_order_key(), $key ) ) {
			self::shell( true );
			return;
		}
		// Meta's plugin records the browser Purchase from this WooCommerce hook.
		ob_start();
		do_action( 'woocommerce_thankyou', $order->get_id() );
		$footer = ob_get_clean();
		echo self::render( 'cart.html', array( // phpcs:ignore WordPress.Security.EscapeOutput
			'title'  => self::store_name() . ' — Order confirmation',
			'config' => array( 'VC_ORDER' => class_exists( 'VC_Orders' ) ? VC_Orders::to_api( $order ) : null ),
			'footer' => $footer,
		) );
	}

	/** Plain pages (policies, account details, password reset) inside the site's header and footer. */
	private static function shell( $not_found = false ) {
		if ( $not_found ) {
			status_header( 404 );
			$title   = 'Page not found';
			$content = '<p>That page doesn\'t exist. <a href="' . esc_url( home_url( '/' ) ) . '">Back to the shop</a>.</p>';
		} else {
			the_post();
			$title   = get_the_title();
			$content = apply_filters( 'the_content', get_the_content() ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals
		}
		$main = '<main id="top">
      <style>
        .policy-page { max-width: 820px; padding-top: 48px; padding-bottom: 72px; }
        .policy-page h1 { font-size: clamp(34px, 6vw, 56px); line-height: 1.05; margin: 6px 0 28px; }
        .policy-page h2 { font-size: clamp(20px, 2.6vw, 26px); line-height: 1.25; letter-spacing: -0.01em; margin: 32px 0 10px; }
        .policy-page p, .policy-page li { font-size: 16px; line-height: 1.65; margin: 0 0 14px; max-width: 70ch; }
        .policy-page .woocommerce form .form-row input.input-text { padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(0,0,0,.15); }
        .policy-page .woocommerce button.button { border-radius: 999px; padding: 12px 22px; }
      </style>
      <section class="section-shell policy-page">
        <p class="eyebrow">' . esc_html( self::store_name() ) . '</p>
        <h1>' . esc_html( $title ) . '</h1>
        ' . $content . '
      </section>
    </main>';
		$html = self::read( 'cart.html' );
		$html = self::replace_first( '/<main[\s\S]*<\/main>/i', $main, $html );
		$html = preg_replace( '/\s*<script src="(?:delivery-fees|cart)\.js[^"]*"><\/script>/i', '', $html );
		$html = str_replace( ' aria-current="page"', '', $html );
		echo self::render( $html, array( 'title' => self::store_name() . ' — ' . $title, 'raw' => true ) ); // phpcs:ignore WordPress.Security.EscapeOutput
	}

	// ---- Rendering -------------------------------------------------------------------
	/** Replaces the first match with literal text ($ and \ in it are kept as they are). */
	private static function replace_first( $pattern, $replacement, $subject ) {
		return preg_replace_callback( $pattern, function () use ( $replacement ) {
			return $replacement;
		}, $subject, 1 );
	}

	private static function read( $file ) {
		$path = get_template_directory() . '/html/' . basename( $file );
		return is_readable( $path ) ? (string) file_get_contents( $path ) : ''; // phpcs:ignore WordPress.WP.AlternativeFunctions
	}

	private static function store_name() {
		return class_exists( 'VC_Settings' ) ? VC_Settings::get()['storeName'] : get_bloginfo( 'name' );
	}

	public static function asset_url( $path ) {
		return get_template_directory_uri() . '/' . ltrim( $path, '/' );
	}

	private static function rewrite_url( $url ) {
		if ( '' === $url || preg_match( '#^(?:[a-z][a-z0-9+.-]*:|//|/|\#)#i', $url ) ) {
			return $url; // absolute, root-relative, data:, tel:, mailto: or in-page anchor
		}
		if ( 0 === strpos( $url, 'assets/' ) ) {
			return self::asset_url( $url );
		}
		if ( preg_match( '#^style\.css(\?.*)?$#', $url, $m ) ) {
			return self::asset_url( 'style.css' ) . ( $m[1] ?? '' );
		}
		if ( preg_match( '#^([a-z0-9-]+\.js)(\?.*)?$#i', $url, $m ) ) {
			return self::asset_url( 'js/' . $m[1] ) . ( $m[2] ?? '' );
		}
		if ( preg_match( '#^([a-z0-9-]+\.html)(\?[^\#]*)?(\#.*)?$#i', $url, $m ) ) {
			$file = $m[1];
			$hash = $m[3] ?? '';
			if ( 0 === strpos( $file, 'admin' ) ) {
				return admin_url();
			}
			if ( isset( self::PAGE_LINKS[ $file . $hash ] ) ) {
				return home_url( self::PAGE_LINKS[ $file . $hash ] );
			}
			if ( isset( self::PAGE_LINKS[ $file ] ) ) {
				return home_url( self::PAGE_LINKS[ $file ] ) . ( $m[2] ?? '' ) . $hash;
			}
		}
		return $url;
	}

	private static function config_script( array $extra ) {
		$config = array_merge( array(
			'VC_THEME_URL'       => trailingslashit( get_template_directory_uri() ),
			'VIBECRAFT_API_BASE' => untrailingslashit( rest_url( 'vibecraft/v1' ) ),
			'VIBECRAFT_WP'       => array( 'nonce' => is_user_logged_in() ? wp_create_nonce( 'wp_rest' ) : '' ),
			'GOOGLE_CLIENT_ID'   => class_exists( 'VC_Settings' ) ? VC_Settings::google_client_id() : '',
		), $extra );
		$lines = array();
		foreach ( $config as $name => $value ) {
			$lines[] = 'window.' . $name . '=' . wp_json_encode( $value, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES ) . ';';
		}
		return '<script>' . implode( '', $lines ) . '</script>';
	}

	private static function share_tags( $title, $product ) {
		$settings    = class_exists( 'VC_Settings' ) ? VC_Settings::get() : array( 'tagline' => '' );
		$url         = $product ? $product['url'] : home_url( add_query_arg( array() ) );
		$url         = strtok( $url, '?' );
		$image       = $product && $product['images'] ? $product['images'][0] : self::asset_url( 'assets/outdoor-cinema.jpg' );
		$description = $product ? ( $product['shortSummary'] ?: $product['description'] ) : ( $settings['tagline'] ?? '' );
		$description = mb_substr( trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( (string) $description ) ) ), 0, 300 );
		$tags        = array(
			'<link rel="canonical" href="' . esc_url( $url ) . '" />',
			'<meta property="og:site_name" content="' . esc_attr( self::store_name() ) . '" />',
			'<meta property="og:type" content="' . ( $product ? 'product' : 'website' ) . '" />',
			'<meta property="og:title" content="' . esc_attr( $title ) . '" />',
			'<meta property="og:description" content="' . esc_attr( $description ) . '" />',
			'<meta property="og:url" content="' . esc_url( $url ) . '" />',
			'<meta property="og:image" content="' . esc_url( $image ) . '" />',
			'<meta name="twitter:card" content="summary_large_image" />',
		);
		if ( $product ) {
			$tags[] = '<meta name="description" content="' . esc_attr( $description ) . '" />';
			$tags[] = '<meta property="product:price:amount" content="' . esc_attr( (string) $product['price'] ) . '" />';
			$tags[] = '<meta property="product:price:currency" content="' . esc_attr( $product['currency'] ) . '" />';
			$tags[] = '<meta property="product:availability" content="' . ( $product['stock'] > 0 ? 'in stock' : 'out of stock' ) . '" />';
		}
		return implode( "\n    ", $tags );
	}

	/**
	 * @param string $file_or_html  A file in html/, or full markup when $args['raw'].
	 */
	public static function render( $file_or_html, array $args = array() ) {
		$html = empty( $args['raw'] ) ? self::read( $file_or_html ) : $file_or_html;
		if ( '' === $html ) {
			return '';
		}

		// Theme asset and page link addresses.
		$html = preg_replace_callback(
			'/\b(src|href|poster)="([^"]*)"/i',
			function ( $m ) {
				return $m[1] . '="' . esc_attr( self::rewrite_url( html_entity_decode( $m[2], ENT_QUOTES ) ) ) . '"';
			},
			$html
		);

		if ( ! empty( $args['title'] ) ) {
			$html = self::replace_first( '/<title>[^<]*<\/title>/i', '<title>' . esc_html( $args['title'] ) . '</title>', $html );
		}
		$is_page_with_preview = ! empty( $args['product'] ) || is_front_page() || is_page( array( 'about', 'contact', 'shop' ) );
		// Cart, checkout, receipts, sign-in and account pages stay out of search results.
		if ( is_page( array( 'cart', 'checkout', 'login', 'signup', 'account' ) ) || ( function_exists( 'is_wc_endpoint_url' ) && is_wc_endpoint_url() ) ) {
			$html = self::replace_first( '/<\/head>/i', '    <meta name="robots" content="noindex, follow" />' . "
  </head>", $html );
		}
		// The home page's large images come from images.unsplash.com: connect early.
		if ( is_front_page() || is_page( array( 'about', 'contact', 'shop' ) ) ) {
			$html = self::replace_first( '/<\/head>/i', '    <link rel="preconnect" href="https://images.unsplash.com" crossorigin />' . "
  </head>", $html );
		}
		if ( ! empty( $args['product'] ) ) {
			$html = preg_replace( '/\s*<meta name="description" content="[^"]*"\s*\/?>/i', '', $html, 1 );
		}

		// Scripts navigate with relative addresses ("cart.html"); resolve them from the site
		// root on every page, including nested ones like /products/<slug>.
		// (Not on plain WordPress pages: their forms post to the current address.)
		if ( empty( $args['raw'] ) ) {
			$html = self::replace_first( '/<head>/i', '<head>' . "\n    " . '<base href="' . esc_url( trailingslashit( home_url( '/' ) ) ) . '">', $html );
		}

		// Ad tracking helper loads just before the page's first script.
		$meta_js = '<script src="' . esc_url( self::asset_url( 'js/vc-meta.js' ) ) . '?v=' . VC_THEME_VERSION . '"></script>';
		$html    = preg_replace( '/(<script src="[^"]*\/js\/api\.js)/i', $meta_js . "\n    $1", $html, 1 );

		ob_start();
		wp_head();
		$head = ob_get_clean();
		$head_extra = self::config_script( $args['config'] ?? array() )
			. ( $is_page_with_preview ? "\n    " . self::share_tags( $args['title'] ?? self::store_name(), $args['product'] ?? null ) : '' );
		$html = self::replace_first( '/<\/head>/i', '    ' . $head_extra . "\n" . $head . "\n  </head>", $html );

		// Body classes (admin bar, WooCommerce) without touching the page's own classes.
		$classes = array_intersect( get_body_class(), array( 'admin-bar', 'logged-in', 'woocommerce-page', 'woocommerce' ) );
		if ( $classes ) {
			$html = preg_replace_callback( '/<body([^>]*)>/i', function ( $m ) use ( $classes ) {
				if ( preg_match( '/class="([^"]*)"/', $m[1] ) ) {
					return '<body' . preg_replace( '/class="([^"]*)"/', 'class="$1 ' . esc_attr( implode( ' ', $classes ) ) . '"', $m[1], 1 ) . '>';
				}
				return '<body' . $m[1] . ' class="' . esc_attr( implode( ' ', $classes ) ) . '">';
			}, $html, 1 );
		}

		ob_start();
		wp_footer();
		$footer = ob_get_clean();
		return self::replace_first( '/<\/body>/i', ( $args['footer'] ?? '' ) . "\n" . $footer . "\n  </body>", $html );
	}
}
