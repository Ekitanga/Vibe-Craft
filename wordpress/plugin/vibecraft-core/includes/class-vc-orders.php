<?php
/**
 * Checkout: turns the storefront's one-page checkout into a WooCommerce order
 * (payment: M-Pesa paybill + code, confirmed by the shop). Orders then appear in
 * WooCommerce → Orders, reduce stock, and are reported to Meta by Meta's plugin.
 */
defined( 'ABSPATH' ) || exit;

class VC_Orders {
	const MAX_LINES    = 20;
	const MAX_QUANTITY = 20;

	public static function init() {
		add_action( 'woocommerce_admin_order_data_after_billing_address', array( __CLASS__, 'admin_details' ) );
		add_filter( 'manage_woocommerce_page_wc-orders_columns', array( __CLASS__, 'add_column' ) );
		add_filter( 'manage_edit-shop_order_columns', array( __CLASS__, 'add_column' ) );
		add_action( 'manage_woocommerce_page_wc-orders_custom_column', array( __CLASS__, 'render_column' ), 10, 2 );
		add_action( 'manage_shop_order_posts_custom_column', array( __CLASS__, 'render_column' ), 10, 2 );
	}

	private static function fail( $message, $status = 400 ) {
		throw new VC_Http_Error( $message, $status );
	}

	private static function text( $value, $max ) {
		$value = trim( sanitize_text_field( (string) ( $value ?? '' ) ) );
		if ( strlen( $value ) > $max ) {
			self::fail( "A field is too long (maximum {$max} characters)." );
		}
		return $value;
	}

	public static function phone_tail( $phone ) {
		$digits = preg_replace( '/\D/', '', (string) $phone );
		return substr( $digits, -9 );
	}

	// ---- Promotions (WooCommerce coupons) ----------------------------------------------
	public static function validate_coupon( $code, $subtotal ) {
		$code = wc_format_coupon_code( (string) $code );
		if ( '' === $code ) {
			self::fail( 'Enter a promotion code.' );
		}
		$coupon = new WC_Coupon( $code );
		$expiry = $coupon->get_date_expires();
		$limit  = $coupon->get_usage_limit();
		$usable = $coupon->get_id()
			&& 'publish' === get_post_status( $coupon->get_id() )
			&& ( ! $expiry || $expiry->getTimestamp() > time() )
			&& ( ! $limit || $coupon->get_usage_count() < $limit );
		if ( ! $usable ) {
			self::fail( 'That promotion is not active or has expired.' );
		}
		$minimum = (float) $coupon->get_minimum_amount();
		if ( $minimum > 0 && (float) $subtotal < $minimum ) {
			self::fail( 'This promotion requires a minimum subtotal of KES ' . number_format( $minimum ) . '.' );
		}
		$amount   = (float) $coupon->get_amount();
		$type     = $coupon->get_discount_type();
		$discount = 'percent' === $type ? round( $subtotal * min( 100, $amount ) / 100 ) : min( $amount, (float) $subtotal );
		if ( $discount <= 0 ) {
			self::fail( 'That promotion is not active or has expired.' );
		}
		return array(
			'promotion'      => array(
				'code'          => strtoupper( $code ),
				'discountType'  => 'percent' === $type ? 'percent' : 'fixed',
				'discountValue' => $amount,
			),
			'discountAmount' => $discount,
			'coupon'         => $code,
		);
	}

	// ---- Create ------------------------------------------------------------------------
	public static function create( array $payload ) {
		$ip       = VC_Limits::client_ip();
		$private  = VC_Settings::get_private();
		if ( ! VC_Limits::hit( 'orders', $ip, $private['ordersPerHourPerIp'], HOUR_IN_SECONDS ) ) {
			self::fail( 'Too many orders from this connection. Please wait a little or call us.', 429 );
		}

		$fulfillment = ( $payload['fulfillment'] ?? '' ) === 'pickup' ? 'pickup' : 'delivery';
		$notes_raw   = (string) ( $payload['notes'] ?? '' );
		if ( false !== stripos( $notes_raw, 'Pickup requested' ) ) {
			$fulfillment = 'pickup';
		}
		$is_pickup = 'pickup' === $fulfillment;

		// Customer.
		$customer = is_array( $payload['customer'] ?? null ) ? $payload['customer'] : array();
		$name     = self::text( $customer['name'] ?? '', 100 );
		$phone    = self::text( $customer['phone'] ?? '', 30 );
		$email    = strtolower( self::text( $customer['email'] ?? '', 254 ) );
		if ( strlen( $name ) < 2 ) {
			self::fail( 'Please enter your full name.' );
		}
		$digits = preg_replace( '/\D/', '', $phone );
		if ( strlen( $digits ) < 9 || strlen( $digits ) > 15 ) {
			self::fail( 'Please enter a valid phone number.' );
		}
		if ( $email && ! is_email( $email ) ) {
			self::fail( 'Please enter a valid email address.' );
		}

		// Delivery.
		$delivery = is_array( $payload['delivery'] ?? null ) ? $payload['delivery'] : array();
		$county   = self::text( $delivery['county'] ?? '', 60 );
		$town     = self::text( $delivery['town'] ?? '', 120 );
		$address  = self::text( $delivery['address'] ?? '', 300 );
		$landmark = self::text( $delivery['landmark'] ?? '', 200 );
		$date     = self::text( $delivery['preferredDate'] ?? '', 10 );
		$time     = self::text( $delivery['preferredTime'] ?? '', 60 );
		if ( ! $is_pickup && ( '' === $county || '' === $town || '' === $address ) ) {
			self::fail( 'Please fill in your county, town and delivery address.' );
		}
		if ( $date && ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date ) ) {
			self::fail( 'Preferred delivery date is invalid.' );
		}
		if ( ! $is_pickup && ! VC_Settings::delivers_to( $county ) ) {
			self::fail( 'We do not currently deliver to that county.' );
		}

		$notes = trim( sanitize_textarea_field( $notes_raw ) );
		if ( strlen( $notes ) > 1000 ) {
			self::fail( 'Notes are too long (maximum 1000 characters).' );
		}
		$mpesa = strtoupper( preg_replace( '/\s+/', '', self::text( $payload['mpesaCode'] ?? '', 30 ) ) );
		if ( $mpesa && ! preg_match( '/^[A-Z0-9]{8,12}$/', $mpesa ) ) {
			self::fail( 'The M-Pesa code looks invalid. It is usually 10 letters and numbers.' );
		}

		// One phone number cannot hold many unconfirmed orders (stops fake-order floods).
		$max_open = (int) $private['pendingOrdersPerPhone'];
		if ( $max_open > 0 && self::open_orders_for_phone( $phone ) >= $max_open ) {
			self::fail( "You already have orders waiting for confirmation. We'll be in touch shortly — or call/WhatsApp us to add to them.", 429 );
		}

		// Items.
		$items = is_array( $payload['items'] ?? null ) ? $payload['items'] : array();
		if ( ! $items ) {
			self::fail( 'Your cart is empty.' );
		}
		if ( count( $items ) > self::MAX_LINES ) {
			self::fail( 'An order can include at most ' . self::MAX_LINES . ' different products.' );
		}
		$quantities = array();
		foreach ( $items as $item ) {
			$key = is_array( $item ) && isset( $item['productId'] ) ? (string) $item['productId'] : '';
			$qty = isset( $item['quantity'] ) ? $item['quantity'] : 1;
			if ( '' === $key || ! is_numeric( $qty ) || (int) $qty != $qty || (int) $qty < 1 ) {
				self::fail( 'Order item quantity must be a whole number of at least 1.' );
			}
			$quantities[ $key ] = ( $quantities[ $key ] ?? 0 ) + (int) $qty;
		}
		$lines    = array();
		$subtotal = 0;
		foreach ( $quantities as $key => $qty ) {
			$product = VC_Products::find( $key );
			if ( ! $product || ! $product->is_purchasable() ) {
				self::fail( 'A product in your cart is no longer available. Please refresh your cart.' );
			}
			if ( $qty > self::MAX_QUANTITY ) {
				self::fail( 'You can order at most ' . self::MAX_QUANTITY . ' of one product online. Call us for bulk orders.' );
			}
			if ( ! $product->has_enough_stock( $qty ) || ! $product->is_in_stock() ) {
				$left = $product->managing_stock() ? (int) $product->get_stock_quantity() : 0;
				self::fail( $product->get_name() . ' has only ' . max( 0, $left ) . ' item(s) in stock.' );
			}
			$lines[]   = array( $product, $qty );
			$subtotal += (float) $product->get_price() * $qty;
		}

		$promo = null;
		if ( ! empty( $payload['promotionCode'] ) ) {
			$promo = self::validate_coupon( $payload['promotionCode'], $subtotal );
		}
		$delivery_fee = $is_pickup ? 0 : VC_Settings::delivery_fee( $county, $subtotal );

		// Build the WooCommerce order.
		$order = wc_create_order( array(
			'customer_id' => is_user_logged_in() ? get_current_user_id() : 0,
			'created_via' => 'vibecraft-storefront',
		) );
		if ( is_wp_error( $order ) ) {
			self::fail( 'Could not place your order. Please try again.', 500 );
		}
		foreach ( $lines as $line ) {
			$order->add_product( $line[0], $line[1] );
		}
		$parts = preg_split( '/\s+/', $name, 2 );
		$order->set_billing_first_name( $parts[0] );
		$order->set_billing_last_name( $parts[1] ?? '' );
		$order->set_billing_phone( $phone );
		if ( $email ) {
			$order->set_billing_email( $email );
		}
		$order->set_billing_country( 'KE' );
		$order->set_billing_state( $county );
		$order->set_billing_city( $town );
		$order->set_billing_address_1( $is_pickup ? 'Pickup at store' : $address );
		$order->set_billing_address_2( $landmark );
		$order->set_shipping_first_name( $parts[0] );
		$order->set_shipping_last_name( $parts[1] ?? '' );
		$order->set_shipping_country( 'KE' );
		$order->set_shipping_state( $is_pickup ? '' : $county );
		$order->set_shipping_city( $is_pickup ? '' : $town );
		$order->set_shipping_address_1( $is_pickup ? 'Pickup at store' : $address );
		$order->set_shipping_address_2( $is_pickup ? '' : $landmark );
		$order->set_shipping_phone( $phone );

		if ( $delivery_fee > 0 ) {
			$fee = new WC_Order_Item_Fee();
			$fee->set_name( 'Transport fee (' . $county . ')' );
			$fee->set_amount( $delivery_fee );
			$fee->set_total( $delivery_fee );
			$fee->set_tax_status( 'none' );
			$order->add_item( $fee );
		}

		$order->set_payment_method( 'vc_mpesa_paybill' );
		$order->set_payment_method_title( 'M-Pesa Paybill' );
		$order->set_customer_ip_address( $ip );
		$order->set_customer_user_agent( isset( $_SERVER['HTTP_USER_AGENT'] ) ? substr( sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ), 0, 400 ) : '' );
		if ( $notes ) {
			$order->set_customer_note( $notes );
		}
		$order->update_meta_data( '_vc_fulfillment', $fulfillment );
		$order->update_meta_data( '_vc_mpesa_code', $mpesa );
		$order->update_meta_data( '_vc_preferred_date', $date );
		$order->update_meta_data( '_vc_preferred_time', $time );
		$order->update_meta_data( '_vc_phone_tail', self::phone_tail( $phone ) );
		$attribution = self::clean_attribution( $payload['attribution'] ?? null );
		if ( $attribution ) {
			$order->update_meta_data( '_vc_attribution', $attribution );
		}
		$order->calculate_totals( false );
		if ( $promo ) {
			$result = $order->apply_coupon( $promo['coupon'] );
			if ( is_wp_error( $result ) ) {
				$order->delete( true );
				self::fail( $result->get_error_message() );
			}
		}
		$order->save();

		// Awaiting the shop's payment confirmation. Reserves stock and emails the shop.
		$order->update_status( 'on-hold', $mpesa ? 'M-Pesa code ' . $mpesa . ' entered at checkout — verify and mark as Processing.' : 'Awaiting M-Pesa payment (paybill).' );
		wc_reduce_stock_levels( $order->get_id() );

		return self::to_api( wc_get_order( $order->get_id() ) );
	}

	public static function clean_attribution( $input ) {
		if ( ! is_array( $input ) ) {
			return null;
		}
		$touch = function ( $value ) {
			if ( ! is_array( $value ) ) {
				return null;
			}
			$out = array();
			foreach ( array( 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid', 'landingPage', 'referrer', 'at' ) as $key ) {
				if ( ! empty( $value[ $key ] ) && is_string( $value[ $key ] ) ) {
					$out[ $key ] = substr( sanitize_text_field( $value[ $key ] ), 0, 'fbclid' === $key ? 500 : 300 );
				}
			}
			return $out ?: null;
		};
		$result = array_filter( array( 'first' => $touch( $input['first'] ?? null ), 'last' => $touch( $input['last'] ?? null ) ) );
		return $result ?: null;
	}

	public static function open_orders_for_phone( $phone ) {
		$ids = wc_get_orders( array(
			'status'       => array( 'on-hold', 'pending' ),
			'limit'        => 20,
			'return'       => 'ids',
			'date_created' => '>' . ( time() - 2 * DAY_IN_SECONDS ),
			'meta_key'     => '_vc_phone_tail',
			'meta_value'   => self::phone_tail( $phone ),
		) );
		return count( $ids );
	}

	// ---- Shape used by the receipt and the account page --------------------------------
	public static function to_api( $order ) {
		if ( ! $order ) {
			return null;
		}
		$items    = array();
		$subtotal = 0;
		foreach ( $order->get_items() as $item ) {
			$qty      = (int) $item->get_quantity();
			$line     = (float) $item->get_subtotal();
			$subtotal += $line;
			$items[]  = array(
				'productId' => (string) $item->get_product_id(),
				'name'      => $item->get_name(),
				'quantity'  => $qty,
				'unitPrice' => $qty ? $line / $qty : 0,
				'lineTotal' => $line,
			);
		}
		$fee = 0;
		foreach ( $order->get_fees() as $fee_item ) {
			$fee += (float) $fee_item->get_total();
		}
		$coupons = $order->get_coupon_codes();
		$status  = $order->get_status();
		$paid    = in_array( $status, array( 'processing', 'completed' ), true );
		$pickup  = 'pickup' === $order->get_meta( '_vc_fulfillment' );
		return array(
			'id'              => (string) $order->get_id(),
			'orderNumber'     => 'VC-' . $order->get_order_number(),
			'status'          => self::public_status( $status ),
			'fulfillment'     => $pickup ? 'pickup' : 'delivery',
			'total'           => (float) $order->get_total(),
			'subtotal'        => $subtotal,
			'deliveryFee'     => $fee,
			'promotionCode'   => $coupons ? strtoupper( $coupons[0] ) : null,
			'discountAmount'  => (float) $order->get_discount_total(),
			'currency'        => $order->get_currency(),
			'customer'        => array(
				'name'  => trim( $order->get_billing_first_name() . ' ' . $order->get_billing_last_name() ),
				'phone' => $order->get_billing_phone(),
				'email' => $order->get_billing_email() ?: null,
			),
			'delivery'        => array(
				'county'        => $order->get_billing_state() ?: null,
				'town'          => $order->get_billing_city() ?: null,
				'address'       => $pickup ? null : ( $order->get_billing_address_1() ?: null ),
				'landmark'      => $order->get_billing_address_2() ?: null,
				'preferredDate' => $order->get_meta( '_vc_preferred_date' ) ?: null,
				'preferredTime' => $order->get_meta( '_vc_preferred_time' ) ?: null,
			),
			'notes'           => $pickup ? trim( 'Pickup requested at Vibecraft location. ' . $order->get_customer_note() ) : $order->get_customer_note(),
			'mpesaCode'       => $order->get_meta( '_vc_mpesa_code' ) ?: null,
			'paymentVerified' => $paid,
			'items'           => $items,
			'createdAt'       => $order->get_date_created() ? $order->get_date_created()->date( DATE_ATOM ) : null,
			// The thank-you page: where Meta's plugin records the Purchase in the browser.
			'receiptUrl'      => $order->get_checkout_order_received_url(),
		);
	}

	private static function public_status( $status ) {
		$map = array(
			'on-hold'    => 'pending',
			'pending'    => 'pending',
			'processing' => 'confirmed',
			'completed'  => 'delivered',
			'cancelled'  => 'cancelled',
			'refunded'   => 'cancelled',
			'failed'     => 'cancelled',
		);
		return $map[ $status ] ?? $status;
	}

	public static function for_user( $user_id ) {
		$orders = wc_get_orders( array( 'customer_id' => $user_id, 'limit' => 50, 'orderby' => 'date', 'order' => 'DESC' ) );
		return array_values( array_map( array( __CLASS__, 'to_api' ), $orders ) );
	}

	// ---- Admin -------------------------------------------------------------------------
	public static function admin_details( $order ) {
		$rows = array(
			'Fulfilment'       => 'pickup' === $order->get_meta( '_vc_fulfillment' ) ? 'Pickup at store' : 'Delivery',
			'M-Pesa code'      => $order->get_meta( '_vc_mpesa_code' ) ?: '— not entered —',
			'Preferred date'   => $order->get_meta( '_vc_preferred_date' ),
			'Preferred time'   => $order->get_meta( '_vc_preferred_time' ),
		);
		$attribution = $order->get_meta( '_vc_attribution' );
		$last        = is_array( $attribution ) ? ( $attribution['last'] ?? $attribution['first'] ?? array() ) : array();
		if ( $last ) {
			$rows['Ad source'] = trim( implode( ' / ', array_filter( array( $last['utm_source'] ?? '', $last['utm_medium'] ?? '', $last['utm_campaign'] ?? '' ) ) ) ) ?: ( ! empty( $last['fbclid'] ) ? 'Meta ad click' : ( $last['referrer'] ?? '' ) );
		}
		echo '<div class="vc-order-details" style="clear:both;padding-top:8px"><h3>Vibecraft checkout</h3>';
		foreach ( $rows as $label => $value ) {
			if ( '' !== (string) $value ) {
				echo '<p><strong>' . esc_html( $label ) . ':</strong> ' . esc_html( $value ) . '</p>';
			}
		}
		echo '<p class="description">Once the M-Pesa payment is confirmed, change the status to <strong>Processing</strong>.</p></div>';
	}

	public static function add_column( $columns ) {
		$new = array();
		foreach ( $columns as $key => $label ) {
			$new[ $key ] = $label;
			if ( 'order_status' === $key ) {
				$new['vc_mpesa'] = 'M-Pesa code';
			}
		}
		return $new;
	}

	public static function render_column( $column, $order ) {
		if ( 'vc_mpesa' !== $column ) {
			return;
		}
		$order = $order instanceof WC_Order ? $order : wc_get_order( $order );
		echo esc_html( $order ? ( $order->get_meta( '_vc_mpesa_code' ) ?: '—' ) : '—' );
	}
}

class VC_Http_Error extends Exception {
	public $status;
	public function __construct( $message, $status = 400 ) {
		parent::__construct( $message );
		$this->status = $status;
	}
}
