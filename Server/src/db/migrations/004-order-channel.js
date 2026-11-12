// Where an order was taken: the website checkout, or recorded by staff for a sale
// closed on WhatsApp, by phone or in the shop. Lets offline sales reach reports and Meta.
exports.up = async (client) => {
  await client.query(`ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'website',
    ADD COLUMN IF NOT EXISTS recorded_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL`);
  await client.query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_channel_check`);
  await client.query(`ALTER TABLE orders ADD CONSTRAINT orders_channel_check
    CHECK (channel IN ('website', 'whatsapp', 'phone', 'walk_in', 'other'))`);
};
