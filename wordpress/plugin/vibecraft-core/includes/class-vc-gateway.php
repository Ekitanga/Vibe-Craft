<?php
/**
 * "M-Pesa Paybill" payment method: the customer pays to the store's paybill and enters
 * the M-Pesa code; the order waits (On hold) until the shop confirms the payment.
 * The paybill and account numbers come from WooCommerce → Vibecraft.
 */
defined( 'ABSPATH' ) || exit;

class VC_Gateway_Mpesa_Paybill extends WC_Payment_Gateway {
	public function __construct() {
		$this->id                 = 'vc_mpesa_paybill';
		$this->method_title       = 'M-Pesa Paybill';
		$this->method_description = 'Customers pay to your M-Pesa paybill and enter the confirmation code. Orders wait as "On hold" until you confirm the payment and mark them Processing.';
		$this->has_fields         = true;
		$this->init_form_fields();
		$this->init_settings();
		$this->title       = $this->get_option( 'title', 'M-Pesa Paybill' );
		$this->description = $this->get_option( 'description' );
		$this->enabled     = $this->get_option( 'enabled', 'yes' );
		add_action( 'woocommerce_update_options_payment_gateways_' . $this->id, array( $this, 'process_admin_options' ) );
	}

	public function init_form_fields() {
		$this->form_fields = array(
			'enabled'     => array( 'title' => 'Enable', 'type' => 'checkbox', 'label' => 'Enable M-Pesa Paybill', 'default' => 'yes' ),
			'title'       => array( 'title' => 'Title', 'type' => 'text', 'default' => 'M-Pesa Paybill' ),
			'description' => array( 'title' => 'Instructions', 'type' => 'textarea', 'default' => 'Pay to the paybill below, then enter the M-Pesa confirmation code.' ),
		);
	}

	public function payment_fields() {
		$settings = VC_Settings::get();
		echo '<p>' . esc_html( $this->description ) . '</p>';
		echo '<p><strong>Paybill:</strong> ' . esc_html( $settings['paybill'] ) . ' &nbsp; <strong>Account:</strong> ' . esc_html( $settings['mpesaAccount'] ) . '</p>';
		echo '<p><label for="vc_mpesa_code">M-Pesa code (optional)</label><input type="text" id="vc_mpesa_code" name="vc_mpesa_code" maxlength="12" autocomplete="off"></p>';
	}

	public function process_payment( $order_id ) {
		$order = wc_get_order( $order_id );
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- WooCommerce verifies the checkout nonce.
		$code = isset( $_POST['vc_mpesa_code'] ) ? strtoupper( preg_replace( '/[^A-Za-z0-9]/', '', sanitize_text_field( wp_unslash( $_POST['vc_mpesa_code'] ) ) ) ) : '';
		if ( $code ) {
			$order->update_meta_data( '_vc_mpesa_code', substr( $code, 0, 12 ) );
		}
		$order->update_status( 'pending', 'Awaiting M-Pesa payment confirmation.' );
		VC_Orders::reserve_stock( $order );
		WC()->cart->empty_cart();
		return array( 'result' => 'success', 'redirect' => $this->get_return_url( $order ) );
	}
}
