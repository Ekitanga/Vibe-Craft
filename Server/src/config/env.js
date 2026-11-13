const dotenv = require("dotenv");
const path = require("path");

// Support both `Server/.env` (backend development) and the project-root `.env`
// (the command used by the Render/local root scripts).
dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config({ path: path.join(__dirname, "../.env"), override: false });

const list = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim().replace(/\/+$/, ""))
    .filter(Boolean);

const nodeEnv = process.env.NODE_ENV || "development";

const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  isTest: nodeEnv === "test",
  port: Number(process.env.PORT) || 5000,
  // 0.0.0.0 for Render; 127.0.0.1 on a VPS where nginx is the only public entry point.
  host: process.env.HOST || "0.0.0.0",
  // Number of reverse proxies in front of the app (nginx = 1). Used to find the visitor's IP.
  trustProxy: process.env.TRUST_PROXY === undefined ? 1 : Number(process.env.TRUST_PROXY),
  // Comma-separated list. The first entry is treated as the canonical public origin.
  clientOrigins: list(process.env.CLIENT_ORIGIN || "http://localhost:5173"),
  get clientOrigin() {
    return this.clientOrigins[0] || "";
  },
  dbPath: process.env.DATABASE_PATH || path.join(__dirname, "../../data/vibecraft.sqlite"),
  databaseUrl: process.env.DATABASE_URL || "",
  pgHost: process.env.PGHOST || "localhost",
  pgPort: Number(process.env.PGPORT) || 5432,
  pgDatabase: process.env.PGDATABASE || process.env.DB_NAME || "VibesCraft",
  pgUser: process.env.PGUSER || "postgres",
  pgPassword: process.env.PGPASSWORD || "",
  pgSsl: process.env.PGSSL === "true",
  // Set to "true" once the database certificate chain is trusted (or PGSSL_CA is provided).
  pgSslRejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED === "true",
  pgSslCa: process.env.PGSSL_CA ? process.env.PGSSL_CA.replace(/\\n/g, "\n") : "",
  adminSessionDays: Number(process.env.ADMIN_SESSION_DAYS) || 7,
  customerSessionDays: Number(process.env.CUSTOMER_SESSION_DAYS) || 30,
  // Only used to create the very first owner account when the database has no admins.
  // It never overwrites an existing account's password or role.
  adminEmail: process.env.ADMIN_EMAIL || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  adminName: process.env.ADMIN_NAME || "Vibecraft Admin",
  // Break-glass override for the private admin sign-in address (Admin → Integrations → Security).
  adminLoginPath: (process.env.ADMIN_LOGIN_PATH || "").trim().replace(/^\/+|\/+$/g, "").toLowerCase(),
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  // Use the lighter model by default. The `gemini-flash-latest` alias currently
  // resolves to a high-demand model for some API projects and can return 503s.
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
  // Key used to encrypt integration secrets (Meta tokens, M-Pesa keys, SMTP password) at rest.
  settingsEncryptionKey: process.env.SETTINGS_ENCRYPTION_KEY || "",
  // Background jobs (pending-order expiry, M-Pesa reconciliation). Disabled automatically in tests.
  backgroundJobs: process.env.BACKGROUND_JOBS !== "false" && nodeEnv !== "test",
};

module.exports = env;
