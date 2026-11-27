<?php
/**
 * A clean admin: the dashboard shows what the shop needs today (orders to confirm or
 * deliver, sales, low stock, Meta/Vibe AI/update status) instead of WordPress news,
 * WooCommerce marketing and setup nags.
 */
defined( 'ABSPATH' ) || exit;

class VC_Dashboard {
	public static function init() {
		add_action( 'wp_dashboard_setup', array( __CLASS__, 'widgets' ), 999 );
		remove_action( 'welcome_panel', 'wp_welcome_panel' );
		// WooCommerce marketing, marketplace suggestions and remote "inbox" promotions.
		add_filter( 'woocommerce_allow_marketplace_suggestions', '__return_false' );
		add_filter( 'woocommerce_show_addons_page', '__return_false' );
		add_filter( 'woocommerce_admin_features', function ( $features ) {
			return array_values( array_diff( (array) $features, array( 'marketing', 'remote-inbox-notifications', 'remote-free-extension', 'payment-gateway-suggestions', 'shipping-label-banner', 'wc-pay-promotion', 'wc-pay-welcome-page', 'launch-your-store' ) ) );
		} );
		add_filter( 'woocommerce_admin_disabled', '__return_false' );
		add_filter( 'woocommerce_helper_suppress_admin_notices', '__return_true' );
		// The shop has no blog: hide Posts and Comments, close comments everywhere.
		add_action( 'admin_menu', function () {
			remove_menu_page( 'edit.php' );
			remove_menu_page( 'edit-comments.php' );
			// WooCommerce's card-payments advert and Meta's (unconfigured) WhatsApp messaging.
			// Payment methods stay in WooCommerce → Settings → Payments.
			remove_menu_page( 'admin.php?page=wc-settings&tab=checkout&from=PAYMENTS_MENU_ITEM' );
			remove_menu_page( 'wc-whatsapp' );
		}, 9999 );
		// No "Welcome to WordPress" banner; the store panel spans the full width.
		add_action( 'load-index.php', function () {
			remove_action( 'welcome_panel', 'wp_welcome_panel' );
			update_user_meta( get_current_user_id(), 'show_welcome_panel', 0 );
		} );
		add_action( 'admin_head-index.php', function () {
			echo '<style>#dashboard-widgets .postbox-container{width:100%!important}#dashboard-widgets #postbox-container-2,#dashboard-widgets #postbox-container-3,#dashboard-widgets #postbox-container-4,.welcome-panel{display:none}</style>';
		} );
		// Updates install themselves (see VC_Updates): no "please update now" banners.
		add_action( 'admin_head', function () {
			remove_action( 'admin_notices', 'update_nag', 3 );
			remove_action( 'network_admin_notices', 'update_nag', 3 );
		}, 1 );
		add_action( 'admin_bar_menu', function ( $bar ) {
			$bar->remove_node( 'comments' );
			$bar->remove_node( 'new-post' );
			$bar->remove_node( 'wp-logo' );
		}, 999 );
		add_filter( 'comments_open', '__return_false', 20 );
		add_filter( 'pings_open', '__return_false', 20 );
		// Update nags are handled automatically (see VC_Updates); hide them from shop managers.
		add_action( 'admin_head', function () {
			if ( ! current_user_can( 'update_core' ) ) {
				remove_action( 'admin_notices', 'update_nag', 3 );
			}
		} );
		add_filter( 'admin_footer_text', function () {
			return 'Vibecraft254 — <a href="' . esc_url( admin_url( 'admin.php?page=vibecraft' ) ) . '">store settings</a>';
		} );
	}

	public static function widgets() {
		global $wp_meta_boxes;
		// Keep only our panel (and WooCommerce's sales status for staff who use it).
		$keep = array( 'vc_store_today' );
		foreach ( array( 'normal', 'side', 'column3', 'column4' ) as $context ) {
			foreach ( array( 'core', 'high', 'default', 'low' ) as $priority ) {
				foreach ( array_keys( $wp_meta_boxes['dashboard'][ $context ][ $priority ] ?? array() ) as $id ) {
					if ( ! in_array( $id, $keep, true ) ) {
						unset( $wp_meta_boxes['dashboard'][ $context ][ $priority ][ $id ] );
					}
				}
			}
		}
		wp_add_dashboard_widget( 'vc_store_today', 'Vibecraft254 — today', array( __CLASS__, 'render' ) );
		// Put it first, full width.
		$widget = $wp_meta_boxes['dashboard']['normal']['core']['vc_store_today'] ?? null;
		if ( $widget ) {
			unset( $wp_meta_boxes['dashboard']['normal']['core']['vc_store_today'] );
			$wp_meta_boxes['dashboard']['normal']['high']['vc_store_today'] = $widget;
		}
	}

	private static function revenue_since( $timestamp ) {
		$orders = wc_get_orders( array(
			'status'       => array( 'processing', 'completed' ),
			'date_created' => '>=' . $timestamp,
			'limit'        => -1,
			'return'       => 'objects',
		) );
		$total = 0;
		foreach ( $orders as $order ) {
			$total += (float) $order->get_total() - (float) $order->get_total_refunded();
		}
		return array( count( $orders ), $total );
	}

	private static function count_status( $status ) {
		return count( wc_get_orders( array( 'status' => $status, 'limit' => -1, 'return' => 'ids' ) ) );
	}

	private static function kes( $amount ) {
		return 'KES ' . number_format( (float) $amount );
	}

	public static function render() {
		$tz          = wp_timezone();
		$today       = ( new DateTime( 'today', $tz ) )->getTimestamp();
		$week        = ( new DateTime( 'monday this week', $tz ) )->getTimestamp();
		$month       = ( new DateTime( 'first day of this month 00:00', $tz ) )->getTimestamp();
		$to_confirm  = self::count_status( 'pending' ) + self::count_status( 'on-hold' );
		$to_deliver  = self::count_status( 'processing' );
		$orders_url  = admin_url( 'admin.php?page=wc-orders' );
		list( $n_today, $r_today ) = self::revenue_since( $today );
		list( $n_week, $r_week )   = self::revenue_since( $week );
		list( $n_month, $r_month ) = self::revenue_since( $month );

		$threshold = class_exists( 'VC_Settings' ) ? max( 1, (int) VC_Settings::get()['lowStockThreshold'] ) : 5;
		$low       = wc_get_products( array( 'status' => 'publish', 'limit' => 20, 'stock_status' => array( 'instock', 'outofstock' ), 'manage_stock' => true, 'orderby' => 'title', 'order' => 'ASC' ) );
		$low       = array_filter( $low, function ( $p ) use ( $threshold ) {
			return (int) $p->get_stock_quantity() <= $threshold;
		} );

		$pixel    = get_option( 'wc_facebook_pixel_id' );
		$catalog  = get_option( 'wc_facebook_product_catalog_id' );
		$ai_ready = class_exists( 'VC_Settings' ) && '' !== (string) VC_Settings::get_private( 'geminiApiKey' );
		$updates  = class_exists( 'VC_Updates' ) ? VC_Updates::state() : array();

		$card = function ( $label, $value, $sub = '', $url = '', $alert = false ) {
			return '<a class="vc-card' . ( $alert ? ' vc-alert' : '' ) . '" href="' . esc_url( $url ?: '#' ) . '"><span>' . esc_html( $label ) . '</span><strong>' . esc_html( $value ) . '</strong><em>' . esc_html( $sub ) . '</em></a>';
		};
		?>
		<style>
			#vc_store_today .inside { margin: 0; padding: 12px; }
			.vc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
			.vc-card { display: block; padding: 12px 14px; border: 1px solid #dcdcde; border-radius: 10px; text-decoration: none; color: #1d2327; background: #fff; }
			.vc-card:hover { border-color: #2271b1; }
			.vc-card span { display: block; font-size: 12px; color: #646970; }
			.vc-card strong { display: block; font-size: 22px; margin: 4px 0 2px; }
			.vc-card em { font-style: normal; font-size: 12px; color: #646970; }
			.vc-alert { border-color: #d63638; background: #fcf0f1; }
			.vc-section { margin-top: 14px; }
			.vc-section h3 { margin: 0 0 6px; font-size: 13px; }
			.vc-status li { margin: 2px 0; }
			.vc-ok { color: #00a32a; } .vc-bad { color: #d63638; }
			.vc-links a { margin-right: 12px; }
		</style>
		<div class="vc-grid">
			<?php
			echo $card( 'Waiting for M-Pesa confirmation', (string) $to_confirm, 'Pending payment', add_query_arg( 'status', 'wc-pending', $orders_url ), $to_confirm > 0 ); // phpcs:ignore
			echo $card( 'To deliver / hand over', (string) $to_deliver, 'Processing', add_query_arg( 'status', 'wc-processing', $orders_url ), $to_deliver > 0 ); // phpcs:ignore
			echo $card( 'Sales today', self::kes( $r_today ), $n_today . ' order(s)', $orders_url ); // phpcs:ignore
			echo $card( 'This week', self::kes( $r_week ), $n_week . ' order(s)', $orders_url ); // phpcs:ignore
			echo $card( 'This month', self::kes( $r_month ), $n_month . ' order(s)', admin_url( 'admin.php?page=wc-admin&path=/analytics/overview' ) ); // phpcs:ignore
			?>
		</div>
		<div class="vc-section">
			<h3>Low stock (<?php echo esc_html( (string) $threshold ); ?> or fewer)</h3>
			<?php if ( $low ) : ?>
				<ul class="vc-status">
					<?php foreach ( $low as $product ) : ?>
						<li><a href="<?php echo esc_url( get_edit_post_link( $product->get_id() ) ); ?>"><?php echo esc_html( $product->get_name() ); ?></a> — <strong class="<?php echo (int) $product->get_stock_quantity() <= 0 ? 'vc-bad' : ''; ?>"><?php echo esc_html( (string) (int) $product->get_stock_quantity() ); ?> left</strong></li>
					<?php endforeach; ?>
				</ul>
			<?php else : ?>
				<p class="vc-ok">All products are well stocked.</p>
			<?php endif; ?>
		</div>
		<div class="vc-section">
			<h3>Connections</h3>
			<ul class="vc-status">
				<li>Meta (Facebook/Instagram ads): <?php echo $pixel ? '<span class="vc-ok">connected</span> — pixel ' . esc_html( $pixel ) . ( $catalog ? ', catalog ' . esc_html( $catalog ) : '' ) : '<span class="vc-bad">not connected</span> — <a href="' . esc_url( admin_url( 'admin.php?page=wc-facebook' ) ) . '">connect</a>'; // phpcs:ignore ?></li>
				<li>Vibe AI: <?php echo $ai_ready ? '<span class="vc-ok">on</span>' : '<span class="vc-bad">off</span> — <a href="' . esc_url( admin_url( 'admin.php?page=vibecraft&tab=ai' ) ) . '">add a Gemini key</a>'; // phpcs:ignore ?></li>
				<li>Automatic updates: <?php echo ! empty( $updates['last_check'] ) ? esc_html( 'last run ' . human_time_diff( $updates['last_check'] ) . ' ago — ' . $updates['last_result'] ) : 'on (updates wait a few days after release, then the shop is checked)'; ?></li>
				<?php foreach ( (array) ( $updates['paused'] ?? array() ) as $slug => $until ) : ?>
					<?php if ( $until > time() ) : ?>
						<li class="vc-bad">Paused after a failed update: <?php echo esc_html( $slug . ' until ' . wp_date( 'j M', $until ) ); ?></li>
					<?php endif; ?>
				<?php endforeach; ?>
			</ul>
		</div>
		<p class="vc-section vc-links">
			<a href="<?php echo esc_url( admin_url( 'post-new.php?post_type=product' ) ); ?>">Add product</a>
			<a href="<?php echo esc_url( admin_url( 'edit.php?post_type=shop_coupon' ) ); ?>">Promo codes</a>
			<a href="<?php echo esc_url( admin_url( 'admin.php?page=vibecraft' ) ); ?>">Store settings</a>
			<a href="<?php echo esc_url( home_url( '/' ) ); ?>" target="_blank" rel="noopener">View shop ↗</a>
		</p>
		<?php
	}
}
