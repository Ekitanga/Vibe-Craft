const { DEFAULT_ROLES } = require("../../config/permissions");

exports.up = async (client) => {
  // ---- Roles & permissions ------------------------------------------------
  await client.query(`CREATE TABLE IF NOT EXISTS admin_roles (
    key TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_-]{1,30}$'),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 100),
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  for (const role of DEFAULT_ROLES) {
    await client.query(
      `INSERT INTO admin_roles (key, name, description, permissions, rank, is_system)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6) ON CONFLICT (key) DO NOTHING`,
      [role.key, role.name, role.description, JSON.stringify(role.permissions), role.rank, role.isSystem]
    );
  }
  await client.query(`DROP TRIGGER IF EXISTS trg_admin_roles_updated_at ON admin_roles`);
  await client.query(`CREATE TRIGGER trg_admin_roles_updated_at BEFORE UPDATE ON admin_roles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

  await client.query(`ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check`);
  await client.query(`ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_fkey`);
  await client.query(`UPDATE admin_users SET role = 'admin' WHERE role NOT IN (SELECT key FROM admin_roles)`);
  await client.query(`ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_fkey
    FOREIGN KEY (role) REFERENCES admin_roles(key) ON UPDATE CASCADE`);
  await client.query(`ALTER TABLE admin_users
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE`);
  await client.query(`ALTER TABLE admin_sessions
    ADD COLUMN IF NOT EXISTS ip TEXT,
    ADD COLUMN IF NOT EXISTS user_agent TEXT`);

  // The old bootstrap overwrote the owner's role with "admin" on every restart, which
  // left production with no owner. Restore one: the earliest-created active admin.
  await client.query(`UPDATE admin_users SET role = 'owner'
    WHERE id = (SELECT id FROM admin_users ORDER BY created_at ASC LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM admin_users WHERE role = 'owner')`);

  // ---- Customer email verification & tokens -------------------------------
  await client.query(`ALTER TABLE customer_accounts
    ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`);
  // Accounts created purely through Google sign-in have a Google-verified email.
  await client.query(`UPDATE customer_accounts SET email_verified = TRUE, email_verified_at = NOW()
    WHERE google_id IS NOT NULL AND password_hash IS NULL AND email_verified = FALSE`);
  await client.query(`CREATE TABLE IF NOT EXISTS customer_tokens (
    id TEXT PRIMARY KEY,
    customer_account_id TEXT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_customer_tokens_account ON customer_tokens(customer_account_id)`);

  // ---- Orders: fulfilment, attribution, anti-abuse, payments --------------
  await client.query(`ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS fulfillment TEXT NOT NULL DEFAULT 'delivery',
    ADD COLUMN IF NOT EXISTS attribution JSONB,
    ADD COLUMN IF NOT EXISTS client_ip TEXT,
    ADD COLUMN IF NOT EXISTS meta_event_id TEXT,
    ADD COLUMN IF NOT EXISTS meta_purchase_sent_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
    ADD COLUMN IF NOT EXISTS promotion_released BOOLEAN NOT NULL DEFAULT FALSE`);
  await client.query(`ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fulfillment_check`);
  await client.query(`ALTER TABLE orders ADD CONSTRAINT orders_fulfillment_check CHECK (fulfillment IN ('delivery', 'pickup'))`);
  await client.query(`UPDATE orders SET fulfillment = 'pickup' WHERE notes LIKE 'Pickup requested%' AND fulfillment = 'delivery'`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_client_ip_created ON orders(client_ip, created_at)`);
  // Phones are matched on their last 9 digits so 0712…, 254712… and +254 712… are the same customer.
  await client.query(`CREATE INDEX IF NOT EXISTS idx_customers_phone_tail ON customers(right(regexp_replace(phone, '\\D', '', 'g'), 9))`);

  await client.query(`CREATE TABLE IF NOT EXISTS mpesa_payments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    checkout_request_id TEXT UNIQUE,
    merchant_request_id TEXT,
    phone TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled')),
    receipt_number TEXT,
    result_code TEXT,
    result_desc TEXT,
    raw_callback JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_mpesa_payments_order ON mpesa_payments(order_id)`);
  await client.query(`DROP TRIGGER IF EXISTS trg_mpesa_payments_updated_at ON mpesa_payments`);
  await client.query(`CREATE TRIGGER trg_mpesa_payments_updated_at BEFORE UPDATE ON mpesa_payments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

  // ---- Integrations (config + encrypted secrets) --------------------------
  await client.query(`CREATE TABLE IF NOT EXISTS app_secrets (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS integration_settings (
    key TEXT PRIMARY KEY,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    secrets TEXT,
    updated_by TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  // Keep the Pixel that is live today working after the hard-coded snippet is removed.
  await client.query(`INSERT INTO integration_settings (key, config)
    VALUES ('meta', '{"pixelEnabled": true, "pixelId": "27209025962115778"}'::jsonb)
    ON CONFLICT (key) DO NOTHING`);

  // ---- Marketing ------------------------------------------------------------
  await client.query(`CREATE TABLE IF NOT EXISTS meta_event_log (
    id BIGSERIAL PRIMARY KEY,
    event_name TEXT NOT NULL,
    event_id TEXT,
    source TEXT NOT NULL,
    status TEXT NOT NULL,
    http_status INTEGER,
    detail JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_meta_event_log_created ON meta_event_log(created_at DESC)`);

  await client.query(`CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'meta_lead_ads',
    external_id TEXT UNIQUE,
    form_id TEXT,
    page_id TEXT,
    ad_id TEXT,
    campaign_name TEXT,
    name TEXT,
    email TEXT,
    phone TEXT,
    fields JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await client.query(`CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC)`);
  await client.query(`DROP TRIGGER IF EXISTS trg_leads_updated_at ON leads`);
  await client.query(`CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON leads
    FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

  // ---- Store settings: public contact email --------------------------------
  await client.query(`ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS contact_email TEXT NOT NULL DEFAULT ''`);
};
