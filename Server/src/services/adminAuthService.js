const crypto = require("crypto");
const db = require("../db/postgres");
const env = require("../config/env");
const HttpError = require("../utils/httpError");
const {
  createExpiryDate,
  createSessionToken,
  hashPassword,
  hashToken,
  normalizeEmail,
  passwordsMatch,
  validateEmail,
} = require("../utils/authSecurity");

const toAdmin = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const cleanupExpiredSessions = async () => {
  await db.query("DELETE FROM admin_sessions WHERE expires_at <= NOW()");
};

const createAdminUser = async ({ email, password, name }) => {
  const normalizedEmail = normalizeEmail(email);

  if (!validateEmail(normalizedEmail)) {
    throw new HttpError(400, "A valid admin email is required.");
  }

  if (!password || String(password).length < 8) {
    throw new HttpError(400, "Admin password must be at least 8 characters.");
  }

  const credentials = hashPassword(password);
  const id = `admin_${crypto.randomUUID()}`;
  const result = await db.query(
    `INSERT INTO admin_users (id, email, password_hash, password_salt, name)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT(email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       password_salt = EXCLUDED.password_salt,
       name = COALESCE(EXCLUDED.name, admin_users.name),
       updated_at = NOW()
     RETURNING id, email, name, role, created_at, updated_at`,
    [id, normalizedEmail, credentials.hash, credentials.salt, String(name || "").trim() || null]
  );

  return toAdmin(result.rows[0]);
};

const listAdminUsers = async () => {
  const result = await db.query(
    `SELECT id, email, name, role, created_at, updated_at FROM admin_users ORDER BY created_at ASC`
  );

  return result.rows.map(toAdmin);
};

const inviteAdminUser = async ({ email, password, name }) => {
  const normalizedEmail = normalizeEmail(email);
  const existing = await db.query("SELECT id FROM admin_users WHERE email = $1", [normalizedEmail]);

  if (existing.rows[0]) {
    throw new HttpError(409, "An admin with that email already exists.");
  }

  return createAdminUser({ email, password, name });
};

const authenticateAdmin = async ({ email, password }) => {
  const normalizedEmail = normalizeEmail(email);

  if (!validateEmail(normalizedEmail) || !password) {
    throw new HttpError(401, "Invalid email or password.");
  }

  const result = await db.query(
    `SELECT id, email, password_hash, password_salt, name, role, created_at, updated_at
     FROM admin_users
     WHERE email = $1`,
    [normalizedEmail]
  );

  const row = result.rows[0];

  if (!row || !passwordsMatch(password, row.password_salt, row.password_hash)) {
    throw new HttpError(401, "Invalid email or password.");
  }

  await cleanupExpiredSessions();

  const token = createSessionToken();
  const expiresAt = createExpiryDate(env.adminSessionDays);

  await db.query(
    `INSERT INTO admin_sessions (id, admin_user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [`session_${crypto.randomUUID()}`, row.id, hashToken(token), expiresAt.toISOString()]
  );

  return {
    admin: toAdmin(row),
    token,
    expiresAt: expiresAt.toISOString(),
  };
};

const getAdminBySessionToken = async (token) => {
  if (!token) {
    return null;
  }

  const result = await db.query(
    `SELECT
       admin_sessions.id AS session_id,
       admin_users.id,
       admin_users.email,
       admin_users.name,
       admin_users.role,
       admin_users.created_at,
       admin_users.updated_at
     FROM admin_sessions
     INNER JOIN admin_users ON admin_users.id = admin_sessions.admin_user_id
     WHERE admin_sessions.token_hash = $1
       AND admin_sessions.expires_at > NOW()`,
    [hashToken(token)]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  await db.query("UPDATE admin_sessions SET last_seen_at = NOW() WHERE id = $1", [row.session_id]);

  return toAdmin(row);
};

const destroyAdminSession = async (token) => {
  if (!token) {
    return;
  }

  await db.query("DELETE FROM admin_sessions WHERE token_hash = $1", [hashToken(token)]);
};

module.exports = {
  authenticateAdmin,
  createAdminUser,
  destroyAdminSession,
  getAdminBySessionToken,
  inviteAdminUser,
  listAdminUsers,
};
