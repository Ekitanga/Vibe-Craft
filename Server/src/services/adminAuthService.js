const crypto = require("crypto");
const db = require("../db/postgres");
const env = require("../config/env");
const HttpError = require("../utils/httpError");
const rbac = require("./rbacService");
const integrationSettings = require("./integrationSettingsService");
const {
  burnPasswordCheck,
  createSessionToken,
  hashPassword,
  hashToken,
  normalizeEmail,
  passwordProblem,
  passwordsMatch,
  validateEmail,
} = require("../utils/authSecurity");

const ADMIN_COLUMNS = "id, email, name, role, is_active, must_change_password, last_login_at, created_at, updated_at";

const toAdmin = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
  isActive: row.is_active !== false,
  mustChangePassword: Boolean(row.must_change_password),
  lastLoginAt: row.last_login_at || null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const withAccess = async (admin) => {
  const role = await rbac.getRole(admin.role);
  return {
    ...admin,
    roleName: role ? role.name : admin.role,
    rank: role ? role.rank : 0,
    permissions: role ? role.permissions : [],
  };
};

const securityConfig = () => integrationSettings.getConfig("security");

const assertStrongPassword = async (password, email) => {
  const config = await securityConfig();
  const problem = passwordProblem(password, { minLength: Number(config.adminPasswordMinLength || 10), email });
  if (problem) throw new HttpError(400, problem);
};

const cleanupExpiredSessions = async () => {
  await db.query("DELETE FROM admin_sessions WHERE expires_at <= NOW()");
};

const findAdminById = async (id) => {
  const result = await db.query(`SELECT ${ADMIN_COLUMNS} FROM admin_users WHERE id = $1`, [id]);
  return result.rows[0] ? withAccess(toAdmin(result.rows[0])) : null;
};

const countActiveOwners = async (client = db) => {
  const result = await client.query("SELECT COUNT(*)::int AS count FROM admin_users WHERE role = 'owner' AND is_active = TRUE");
  return result.rows[0].count;
};

// Inserts a new admin. Never overwrites an existing account (the old upsert silently
// reset the owner's password and role from environment variables on every restart).
const insertAdmin = async ({ email, password, name, role }) => {
  const normalizedEmail = normalizeEmail(email);
  if (!validateEmail(normalizedEmail)) throw new HttpError(400, "A valid admin email is required.");
  const cleanName = String(name || "").trim().slice(0, 80);
  if (cleanName.length < 2) throw new HttpError(400, "Name must be at least 2 characters.");
  if (!(await rbac.getRole(role))) throw new HttpError(400, "Invalid admin role.");

  const credentials = await hashPassword(password);
  try {
    const result = await db.query(
      `INSERT INTO admin_users (id, email, password_hash, password_salt, name, role, password_changed_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING ${ADMIN_COLUMNS}`,
      [`admin_${crypto.randomUUID()}`, normalizedEmail, credentials.hash, credentials.salt, cleanName, role]
    );
    rbac.clearCache();
    return toAdmin(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "An admin with that email already exists.");
    throw error;
  }
};

// Used by `npm run admin:create` (a trusted operator on the server). Creates the
// account, or with { resetExisting: true } explicitly resets an existing one.
const createAdminUser = async ({ email, password, name, role = "owner", resetExisting = false }) => {
  await assertStrongPassword(password, email);
  const normalizedEmail = normalizeEmail(email);
  const existing = await db.query("SELECT id FROM admin_users WHERE email = $1", [normalizedEmail]);

  if (existing.rows[0]) {
    if (!resetExisting) throw new HttpError(409, "An admin with that email already exists. Pass --reset to reset its password and role.");
    const credentials = await hashPassword(password);
    const result = await db.query(
      `UPDATE admin_users SET password_hash = $2, password_salt = $3, role = $4, is_active = TRUE,
         name = COALESCE(NULLIF($5, ''), name), password_changed_at = NOW()
       WHERE id = $1 RETURNING ${ADMIN_COLUMNS}`,
      [existing.rows[0].id, credentials.hash, credentials.salt, role, String(name || "").trim()]
    );
    await db.query("DELETE FROM admin_sessions WHERE admin_user_id = $1", [existing.rows[0].id]);
    return toAdmin(result.rows[0]);
  }

  return insertAdmin({ email, password, name: name || "Vibecraft Admin", role });
};

// Startup hook: only creates the first owner on an empty database.
const ensureBootstrapOwner = async ({ log = console.log } = {}) => {
  const count = (await db.query("SELECT COUNT(*)::int AS count FROM admin_users")).rows[0].count;
  if (count > 0) {
    if (env.adminPassword) {
      log("ADMIN_PASSWORD is set but ignored because admins already exist. Remove it from the environment.");
    }
    return null;
  }
  if (!env.adminEmail || !env.adminPassword) {
    log("No admin accounts exist. Run `npm run admin:create -- --email you@example.com --password '...'` to create the owner.");
    return null;
  }
  const admin = await createAdminUser({ email: env.adminEmail, password: env.adminPassword, name: env.adminName, role: "owner" });
  log(`Created first owner account: ${admin.email}. Remove ADMIN_PASSWORD from the environment now.`);
  return admin;
};

const listAdminUsers = async () => {
  const result = await db.query(
    `SELECT ${ADMIN_COLUMNS.split(", ").map((column) => "u." + column).join(", ")},
       (SELECT COUNT(*) FROM admin_sessions s WHERE s.admin_user_id = u.id AND s.expires_at > NOW())::int AS active_sessions
     FROM admin_users u ORDER BY u.created_at ASC`
  );
  return Promise.all(
    result.rows.map(async (row) => ({ ...(await withAccess(toAdmin(row))), activeSessions: row.active_sessions }))
  );
};

const inviteAdminUser = async (actor, { email, password, name, role }) => {
  await rbac.canAssignRole(actor, role);
  await assertStrongPassword(password, email);
  return insertAdmin({ email, password, name, role });
};

const createSession = async (adminId, { ip, userAgent } = {}) => {
  const config = await securityConfig();
  const hours = Number(config.adminSessionHours) || env.adminSessionDays * 24;
  const token = createSessionToken();
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  await db.query(
    `INSERT INTO admin_sessions (id, admin_user_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [`session_${crypto.randomUUID()}`, adminId, hashToken(token), expiresAt.toISOString(), ip || null, String(userAgent || "").slice(0, 300) || null]
  );
  return { token, expiresAt: expiresAt.toISOString() };
};

// Throws 401 for any credential problem. Rate limiting is applied by the caller (loginGuard).
const authenticateAdmin = async ({ email, password } = {}, context = {}) => {
  const normalizedEmail = normalizeEmail(email);
  if (!validateEmail(normalizedEmail) || !password) throw new HttpError(401, "Invalid email or password.");

  const result = await db.query(
    `SELECT ${ADMIN_COLUMNS}, password_hash, password_salt FROM admin_users WHERE email = $1`,
    [normalizedEmail]
  );
  const row = result.rows[0];

  if (!row) {
    await burnPasswordCheck(password);
    throw new HttpError(401, "Invalid email or password.");
  }
  if (!(await passwordsMatch(password, row.password_salt, row.password_hash))) {
    throw new HttpError(401, "Invalid email or password.");
  }
  if (row.is_active === false) throw new HttpError(401, "Invalid email or password.");

  await cleanupExpiredSessions();
  const session = await createSession(row.id, context);
  // A password that fails today's policy (e.g. "password") still signs in, but the
  // admin is locked to the change-password screen until they pick a strong one.
  const config = await securityConfig();
  const weak = Boolean(passwordProblem(password, { minLength: Number(config.adminPasswordMinLength || 10), email: row.email }));
  await db.query(
    "UPDATE admin_users SET last_login_at = NOW(), must_change_password = (must_change_password OR $2) WHERE id = $1",
    [row.id, weak]
  );
  row.must_change_password = row.must_change_password || weak;

  return { admin: await withAccess(toAdmin(row)), ...session };
};

const changeAdminPassword = async (adminId, { currentPassword, newPassword }, { keepSessionToken } = {}) => {
  const result = await db.query("SELECT email, password_hash, password_salt FROM admin_users WHERE id = $1", [adminId]);
  const row = result.rows[0];
  if (!row) throw new HttpError(404, "Admin not found.");
  if (!currentPassword || !(await passwordsMatch(currentPassword, row.password_salt, row.password_hash))) {
    throw new HttpError(401, "Your current password is incorrect.");
  }
  if (currentPassword === newPassword) throw new HttpError(400, "Choose a password different from your current one.");
  await assertStrongPassword(newPassword, row.email);

  const credentials = await hashPassword(newPassword);
  await db.query(
    "UPDATE admin_users SET password_hash = $1, password_salt = $2, password_changed_at = NOW(), must_change_password = FALSE WHERE id = $3",
    [credentials.hash, credentials.salt, adminId]
  );
  // Sign out every other device.
  await db.query("DELETE FROM admin_sessions WHERE admin_user_id = $1 AND token_hash <> $2", [
    adminId,
    keepSessionToken ? hashToken(keepSessionToken) : "",
  ]);
};

const updateAdminUser = async (actor, id, input = {}) => {
  const target = await findAdminById(id);
  rbac.assertCanManage(actor, target);
  const isSelf = target.id === actor.id;
  const updates = {};

  if (input.name !== undefined) {
    const name = String(input.name || "").trim().slice(0, 80);
    if (name.length < 2) throw new HttpError(400, "Name must be at least 2 characters.");
    updates.name = name;
  }
  if (input.role !== undefined && input.role !== target.role) {
    if (isSelf) throw new HttpError(400, "You cannot change your own role. Ask another owner.");
    await rbac.canAssignRole(actor, input.role);
    updates.role = input.role;
  }
  if (input.isActive !== undefined) {
    const isActive = input.isActive === true || input.isActive === "true";
    if (isSelf && !isActive) throw new HttpError(400, "You cannot disable your own account.");
    updates.is_active = isActive;
  }

  const keys = Object.keys(updates);
  if (!keys.length) return target;

  await db.withTransaction(async (client) => {
    await client.query(
      `UPDATE admin_users SET ${keys.map((key, index) => `${key} = $${index + 2}`).join(", ")} WHERE id = $1`,
      [id, ...keys.map((key) => updates[key])]
    );
    if (target.role === "owner" && (await countActiveOwners(client)) < 1) {
      throw new HttpError(400, "The store must keep at least one active owner.");
    }
    if (updates.role || updates.is_active === false) {
      await client.query("DELETE FROM admin_sessions WHERE admin_user_id = $1", [id]);
    }
  });
  rbac.clearCache();
  return findAdminById(id);
};

const deleteAdminUser = async (actor, id) => {
  const target = await findAdminById(id);
  rbac.assertCanManage(actor, target);
  if (target.id === actor.id) throw new HttpError(400, "You cannot remove your own account.");
  await db.withTransaction(async (client) => {
    await client.query("DELETE FROM admin_users WHERE id = $1", [id]);
    if (target.role === "owner" && (await countActiveOwners(client)) < 1) {
      throw new HttpError(400, "The store must keep at least one active owner.");
    }
  });
  rbac.clearCache();
  return target;
};

const resetAdminPassword = async (actor, id, newPassword) => {
  const target = await findAdminById(id);
  rbac.assertCanManage(actor, target);
  if (target.id === actor.id) throw new HttpError(400, "Use “Change your password” for your own account.");
  await assertStrongPassword(newPassword, target.email);
  const credentials = await hashPassword(newPassword);
  await db.query(
    "UPDATE admin_users SET password_hash = $1, password_salt = $2, password_changed_at = NOW(), must_change_password = TRUE WHERE id = $3",
    [credentials.hash, credentials.salt, id]
  );
  await db.query("DELETE FROM admin_sessions WHERE admin_user_id = $1", [id]);
  return target;
};

const revokeAdminSessions = async (actor, id) => {
  const target = await findAdminById(id);
  if (target && target.id !== actor.id) rbac.assertCanManage(actor, target);
  if (!target) throw new HttpError(404, "Admin not found.");
  const result = await db.query("DELETE FROM admin_sessions WHERE admin_user_id = $1", [id]);
  return { target, revoked: result.rowCount };
};

const getAdminBySessionToken = async (token) => {
  if (!token) return null;

  const result = await db.query(
    `SELECT admin_sessions.id AS session_id, ${ADMIN_COLUMNS.split(", ").map((column) => "admin_users." + column).join(", ")}
     FROM admin_sessions
     INNER JOIN admin_users ON admin_users.id = admin_sessions.admin_user_id
     WHERE admin_sessions.token_hash = $1
       AND admin_sessions.expires_at > NOW()
       AND admin_users.is_active = TRUE`,
    [hashToken(token)]
  );
  const row = result.rows[0];
  if (!row) return null;

  await db.query("UPDATE admin_sessions SET last_seen_at = NOW() WHERE id = $1", [row.session_id]);
  return withAccess(toAdmin(row));
};

const destroyAdminSession = async (token) => {
  if (!token) return;
  await db.query("DELETE FROM admin_sessions WHERE token_hash = $1", [hashToken(token)]);
};

module.exports = {
  authenticateAdmin,
  changeAdminPassword,
  createAdminUser,
  deleteAdminUser,
  destroyAdminSession,
  ensureBootstrapOwner,
  findAdminById,
  getAdminBySessionToken,
  inviteAdminUser,
  listAdminUsers,
  resetAdminPassword,
  revokeAdminSessions,
  updateAdminUser,
};
