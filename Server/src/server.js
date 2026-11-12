const app = require("./app");
const env = require("./config/env");
const db = require("./db/postgres");
const { runMigrations } = require("./db/migrate");
const adminAuthService = require("./services/adminAuthService");
const jobs = require("./services/jobs");

const startServer = async () => {
  await runMigrations();
  await adminAuthService.ensureBootstrapOwner();

  if (env.isProduction && !env.settingsEncryptionKey) {
    console.warn("SETTINGS_ENCRYPTION_KEY is not set: integration secrets use a database-stored key. Set it for stronger protection.");
  }

  const server = app.listen(env.port, env.host, () => {
    console.log(`Vibecraft API listening on ${env.host}:${env.port} using Gemini model ${env.geminiModel}`);
  });

  if (env.backgroundJobs) jobs.start();

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down.`);
    jobs.stop();
    server.close(() => db.pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

startServer().catch(async (error) => {
  console.error("Could not start the server:", error.message || error);
  await db.pool.end();
  process.exit(1);
});
