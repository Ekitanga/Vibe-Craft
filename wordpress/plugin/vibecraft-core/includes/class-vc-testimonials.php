<?php
/**
 * Testimonials (written or video) managed under WooCommerce → Testimonials.
 */
defined( 'ABSPATH' ) || exit;

class VC_Testimonials {
	const TYPE = 'vc_testimonial';

	public static function init() {
		add_action( 'init', array( __CLASS__, 'register' ) );
		add_action( 'add_meta_boxes', array( __CLASS__, 'add_meta_box' ) );
		add_action( 'save_post_' . self::TYPE, array( __CLASS__, 'save' ) );
	}

	public static function register() {
		register_post_type( self::TYPE, array(
			'labels'       => array(
				'name'          => 'Testimonials',
				'singular_name' => 'Testimonial',
				'add_new_item'  => 'Add testimonial',
				'edit_item'     => 'Edit testimonial',
			),
			'public'       => false,
			'show_ui'      => true,
			'show_in_menu' => 'woocommerce',
			'supports'     => array( 'title', 'editor', 'page-attributes' ),
			'menu_icon'    => 'dashicons-format-quote',
		) );
	}

	public static function add_meta_box() {
		add_meta_box( 'vc_testimonial', 'Customer & video', array( __CLASS__, 'render' ), self::TYPE, 'normal', 'high' );
	}

	public static function render( $post ) {
		wp_nonce_field( 'vc_testimonial', 'vc_testimonial_nonce' );
		echo '<p>Title = customer name. The editor = the quote. "Order" (in Page attributes) sets the display order.</p><table class="form-table"><tbody>';
		$fields = array(
			'_vc_location'   => array( 'Customer location', 'text' ),
			'_vc_video_url'  => array( 'Video URL (optional)', 'url' ),
			'_vc_poster_url' => array( 'Video poster image URL (optional)', 'url' ),
		);
		foreach ( $fields as $key => $field ) {
			printf(
				'<tr><th><label for="%1$s">%2$s</label></th><td><input type="%3$s" class="regular-text" id="%1$s" name="%1$s" value="%4$s"></td></tr>',
				esc_attr( $key ),
				esc_html( $field[0] ),
				esc_attr( $field[1] ),
				esc_attr( get_post_meta( $post->ID, $key, true ) )
			);
		}
		echo '</tbody></table>';
	}

	public static function save( $post_id ) {
		if ( ! isset( $_POST['vc_testimonial_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['vc_testimonial_nonce'] ) ), 'vc_testimonial' ) ) {
			return;
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}
		update_post_meta( $post_id, '_vc_location', sanitize_text_field( wp_unslash( $_POST['_vc_location'] ?? '' ) ) );
		update_post_meta( $post_id, '_vc_video_url', esc_url_raw( wp_unslash( $_POST['_vc_video_url'] ?? '' ) ) );
		update_post_meta( $post_id, '_vc_poster_url', esc_url_raw( wp_unslash( $_POST['_vc_poster_url'] ?? '' ) ) );
	}

	public static function published() {
		$posts = get_posts( array(
			'post_type'      => self::TYPE,
			'post_status'    => 'publish',
			'posts_per_page' => 100,
			'orderby'        => array( 'menu_order' => 'ASC', 'date' => 'ASC' ),
		) );
		return array_map( function ( $post ) {
			$video = get_post_meta( $post->ID, '_vc_video_url', true );
			return array(
				'id'             => (string) $post->ID,
				'clientName'     => get_the_title( $post ),
				'clientLocation' => get_post_meta( $post->ID, '_vc_location', true ) ?: null,
				'quote'          => trim( wp_strip_all_tags( $post->post_content ) ),
				'reviewType'     => $video ? 'video' : 'written',
				'videoUrl'       => $video ?: null,
				'posterUrl'      => get_post_meta( $post->ID, '_vc_poster_url', true ) ?: null,
				'isPublished'    => true,
				'sortOrder'      => (int) $post->menu_order,
				'createdAt'      => get_post_time( DATE_ATOM, true, $post ),
				'updatedAt'      => get_post_modified_time( DATE_ATOM, true, $post ),
			);
		}, $posts );
	}
}
