// Columns that older databases received from ad-hoc startup ALTERs and the
// migrate-admin-controls / migrate-testimonials scripts. Idempotent.
const { deliveryFees } = require("../../config/deliveryFees");

exports.up = async (client) => {
  await client.query(`ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS delivery_fee INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS promotion_code TEXT,
    ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0`);

  await client.query(`ALTER TABLE site_settings
    ADD COLUMN IF NOT EXISTS delivery_fees JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS delivery_availability JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS free_delivery_minimum INTEGER NOT NULL DEFAULT 0`);

  await client.query(
    `INSERT INTO site_settings (id, delivery_fees) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(deliveryFees)]
  );
  await client.query(
    `UPDATE site_settings SET delivery_fees = $1::jsonb WHERE id = 1 AND delivery_fees = '{}'::jsonb`,
    [JSON.stringify(deliveryFees)]
  );

  await client.query("ALTER TABLE testimonials ALTER COLUMN video_url DROP NOT NULL");
  await client.query("ALTER TABLE testimonials ADD COLUMN IF NOT EXISTS review_type TEXT NOT NULL DEFAULT 'video'");
  await client.query("UPDATE testimonials SET review_type = 'written' WHERE video_url IS NULL AND review_type <> 'written'");
  await client.query("ALTER TABLE testimonials DROP CONSTRAINT IF EXISTS testimonials_review_type_check");
  await client.query("ALTER TABLE testimonials ADD CONSTRAINT testimonials_review_type_check CHECK (review_type IN ('video', 'written'))");
};
