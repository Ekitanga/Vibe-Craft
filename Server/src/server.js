const app = require("./app");
const env = require("./config/env");
const db = require("./db/postgres");
const adminAuthService = require("./services/adminAuthService");

const ensureDatabaseMigrations = async () => {
  await db.query(`ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS delivery_fee INTEGER NOT NULL DEFAULT 0`);
};

const ensureBootstrapAdmin = async () => {
  if (!env.adminEmail || !env.adminPassword) {
    return;
  }

  try {
    await adminAuthService.createAdminUser({
      email: env.adminEmail,
      password: env.adminPassword,
      name: env.adminName,
    });
    console.log(`Bootstrap admin ensured: ${env.adminEmail}`);
  } catch (error) {
    console.error("Could not ensure bootstrap admin:", error.message || error);
  }
};

const startServer = async () => {
  await ensureDatabaseMigrations();
  await ensureBootstrapAdmin();

  app.listen(env.port, "0.0.0.0", () => {
    console.log(`Vibecraft API listening on port ${env.port} using Gemini model ${env.geminiModel}`);
  });
};

startServer().catch(async (error) => {
  console.error("Could not initialize the database:", error.message || error);
  await db.pool.end();
  process.exit(1);
});
