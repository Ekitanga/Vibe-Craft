const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 5000,
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  dbPath: process.env.DATABASE_PATH || path.join(__dirname, "../../data/vibecraft.sqlite"),
  databaseUrl: process.env.DATABASE_URL || "",
  pgHost: process.env.PGHOST || "localhost",
  pgPort: Number(process.env.PGPORT) || 5432,
  pgDatabase: process.env.PGDATABASE || process.env.DB_NAME || "VibesCraft",
  pgUser: process.env.PGUSER || "postgres",
  pgPassword: process.env.PGPASSWORD || "password",
  pgSsl: process.env.PGSSL === "true",
  adminSessionDays: Number(process.env.ADMIN_SESSION_DAYS) || 7,
  customerSessionDays: Number(process.env.CUSTOMER_SESSION_DAYS) || 30,
  adminEmail: process.env.ADMIN_EMAIL || "",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  adminName: process.env.ADMIN_NAME || "Vibecraft Admin",
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-flash-latest",
};

module.exports = env;
