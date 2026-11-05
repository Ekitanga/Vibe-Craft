const db = require("./postgres");
const { deliveryFees } = require("../config/deliveryFees");

const run = async () => {
  await db.query(`CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql`);

  await db.query(`CREATE TABLE IF NOT EXISTS site_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    store_name TEXT NOT NULL DEFAULT 'Vibecraft',
    tagline TEXT NOT NULL DEFAULT 'Big picture energy, made practical.',
    hero_title TEXT NOT NULL DEFAULT 'See more in every room.',
    hero_description TEXT NOT NULL DEFAULT 'Thoughtful projector setups for movie nights, big ideas, and shared moments.',
    phone TEXT NOT NULL DEFAULT '0707 472897',
    whatsapp TEXT NOT NULL DEFAULT '0707 472897',
    paybill TEXT NOT NULL DEFAULT '522533',
    mpesa_account TEXT NOT NULL DEFAULT '8055906',
    address TEXT NOT NULL DEFAULT 'Rasumal House, 4th floor, Shop 14',
    opening_hours TEXT NOT NULL DEFAULT 'Monday to Saturday: 8:00 AM – 7:00 PM',
    announcement TEXT NOT NULL DEFAULT '',
    primary_color TEXT NOT NULL DEFAULT '#cc3355',
    accent_color TEXT NOT NULL DEFAULT '#ffd2d5',
    low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold BETWEEN 0 AND 100),
    delivery_fees JSONB NOT NULL DEFAULT '{}'::jsonb,
    delivery_availability JSONB NOT NULL DEFAULT '{}'::jsonb,
    social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
    free_delivery_minimum INTEGER NOT NULL DEFAULT 0 CHECK (free_delivery_minimum >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`ALTER TABLE site_settings
    ADD COLUMN IF NOT EXISTS delivery_fees JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS delivery_availability JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS free_delivery_minimum INTEGER NOT NULL DEFAULT 0`);
  await db.query(
    `INSERT INTO site_settings (id, delivery_fees)
     VALUES (1, $1::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [JSON.stringify(deliveryFees)]
  );
  await db.query(`DROP TRIGGER IF EXISTS trg_site_settings_updated_at ON site_settings`);
  await db.query(`CREATE TRIGGER trg_site_settings_updated_at
    BEFORE UPDATE ON site_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

  await db.query(`CREATE TABLE IF NOT EXISTS site_settings_history (
    id TEXT PRIMARY KEY,
    settings JSONB NOT NULL,
    changed_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_site_settings_history_created_at ON site_settings_history(created_at DESC)`);

  await db.query(`CREATE TABLE IF NOT EXISTS promotions (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
    discount_value INTEGER NOT NULL CHECK (discount_value > 0),
    minimum_subtotal INTEGER NOT NULL DEFAULT 0 CHECK (minimum_subtotal >= 0),
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
    used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (discount_type <> 'percent' OR discount_value <= 100),
    CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at)
  )`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_promotions_code ON promotions(code)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(active)`);
  await db.query(`DROP TRIGGER IF EXISTS trg_promotions_updated_at ON promotions`);
  await db.query(`CREATE TRIGGER trg_promotions_updated_at
    BEFORE UPDATE ON promotions FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

  await db.query(`CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id TEXT PRIMARY KEY,
    admin_user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC)`);

  await db.query(`ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS promotion_code TEXT,
    ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0`);

  await db.query(`ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check`);
  await db.query(`ALTER TABLE admin_users
    ADD CONSTRAINT admin_users_role_check CHECK (role IN ('owner', 'admin', 'manager', 'editor'))`);

  console.log(JSON.stringify({ success: true, migrated: ["site_settings", "promotions", "admin_audit_logs", "order promotions", "admin roles"] }));
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end();
  });
