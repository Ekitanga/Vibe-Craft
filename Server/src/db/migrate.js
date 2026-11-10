// Ordered, tracked schema migrations. Each file in ./migrations exports `up(client)` and
// runs once inside its own transaction; applied names are stored in schema_migrations.
// Every migration is written to be idempotent so it is also safe on databases that were
// created by the older init/migrate scripts.
const fs = require("fs");
const path = require("path");
const db = require("./postgres");

const migrationsDir = path.join(__dirname, "migrations");

const listMigrations = () =>
  fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d{3}-.+\.js$/.test(file))
    .sort();

const runMigrations = async ({ log = console.log } = {}) => {
  // Serialise concurrent boots (e.g. two Render instances during a deploy).
  const lockClient = await db.pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock(727274)");
    await lockClient.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const applied = new Set((await lockClient.query("SELECT name FROM schema_migrations")).rows.map((row) => row.name));
    const ran = [];

    for (const file of listMigrations()) {
      if (applied.has(file)) continue;
      const migration = require(path.join(migrationsDir, file));
      await db.withTransaction(async (client) => {
        await migration.up(client);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      });
      ran.push(file);
      log(`Applied migration ${file}`);
    }

    return ran;
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock(727274)").catch(() => {});
    lockClient.release();
  }
};

module.exports = { listMigrations, runMigrations };

if (require.main === module) {
  runMigrations()
    .then((ran) => console.log(JSON.stringify({ success: true, applied: ran })))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => db.pool.end());
}
