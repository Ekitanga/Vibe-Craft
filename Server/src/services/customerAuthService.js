const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const db = require("../db/postgres");
const env = require("../config/env");
const HttpError = require("../utils/httpError");
const integrationSettings = require("./integrationSettingsService");
const {
  burnPasswordCheck,
  createExpiryDate,
  createSessionToken,
  hashPassword,
  hashToken,
  normalizeEmail,
  passwordProblem,
  passwordsMatch,
  validateEmail,
} = require("../utils/authSecurity");

const googleClient = new OAuth2Client(env.googleClientId);

const ACCOUNT_COLUMNS = "id, name, email, phone, profile_image_url, password_hash, google_id, email_verified, created_at, updated_at";

const normalizePhone = (phone) => String(phone || "").trim().slice(0, 30);

const toCustomerAccount = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  profileImageUrl: row.profile_image_url || null,
  hasPassword: Boolean(row.password_hash),
  hasGoogleLinked: Boolean(row.google_id),
  emailVerified: Boolean(row.email_verified),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const assertStrongPassword = async (password, email) => {
  const config = await integrationSettings.getConfig("security");
  const problem = passwordProblem(password, { minLength: Number(config.customerPasswordMinLength || 8), email });
  if (problem) throw new HttpError(400, problem);
};

const validateSignupPayload = async ({ name, email, password }) => {
  const normalizedName = String(name || "").trim();
  const normalizedEmail = normalizeEmail(email);

  if (normalizedName.length < 2) throw new HttpError(400, "Your name must be at least 2 characters.");
  if (normalizedName.length > 100) throw new HttpError(400, "Your name is too long.");
  if (!validateEmail(normalizedEmail)) throw new HttpError(400, "A valid email is required.");
  await assertStrongPassword(password, normalizedEmail);

  return { email: normalizedEmail, name: normalizedName };
};

const cleanupExpiredSessions = async () => {
  await db.query("DELETE FROM customer_sessions WHERE expires_at <= NOW()");
};

const createSessionForCustomer = async (customerId) => {
  await cleanupExpiredSessions();
  const token = createSessionToken();
  const expiresAt = createExpiryDate(env.customerSessionDays);
  await db.query(
    `INSERT INTO customer_sessions (id, customer_account_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [`customer_session_${crypto.randomUUID()}`, customerId, hashToken(token), expiresAt.toISOString()]
  );
  return { token, expiresAt: expiresAt.toISOString() };
};

// ---- Email verification ---------------------------------------------------------
const createToken = async (accountId, purpose, hours) => {
  const token = crypto.randomBytes(32).toString("base64url");
  await db.query("DELETE FROM customer_tokens WHERE customer_account_id = $1 AND purpose = $2", [accountId, purpose]);
  await db.query(
    `INSERT INTO customer_tokens (id, customer_account_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + make_interval(hours => $5))`,
    [crypto.randomUUID(), accountId, purpose, hashToken(token), hours]
  );
  return token;
};

const createEmailVerificationToken = (accountId) => createToken(accountId, "verify_email", 24);

const verifyEmailToken = async (token) => {
  if (!token || String(token).length > 200) throw new HttpError(400, "This verification link is invalid.");
  const result = await db.query(
    `UPDATE customer_tokens SET used_at = NOW()
     WHERE token_hash = $1 AND purpose = 'verify_email' AND used_at IS NULL AND expires_at > NOW()
     RETURNING customer_account_id`,
    [hashToken(token)]
  );
  if (!result.rows[0]) throw new HttpError(400, "This verification link has expired or was already used.");
  const updated = await db.query(
    `UPDATE customer_accounts SET email_verified = TRUE, email_verified_at = NOW() WHERE id = $1 RETURNING ${ACCOUNT_COLUMNS}`,
    [result.rows[0].customer_account_id]
  );
  return toCustomerAccount(updated.rows[0]);
};

// ---- Sign up / sign in ----------------------------------------------------------
const signupCustomer = async ({ name, email, phone, password }) => {
  const normalized = await validateSignupPayload({ name, email, password });
  const existing = await db.query("SELECT id FROM customer_accounts WHERE email = $1", [normalized.email]);
  if (existing.rows[0]) throw new HttpError(409, "An account with that email already exists.");

  const credentials = await hashPassword(password);
  let result;
  try {
    result = await db.query(
      `INSERT INTO customer_accounts (id, name, email, phone, password_hash, password_salt)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${ACCOUNT_COLUMNS}`,
      [`customer_${crypto.randomUUID()}`, normalized.name, normalized.email, normalizePhone(phone) || null, credentials.hash, credentials.salt]
    );
  } catch (error) {
    if (error.code === "23505") throw new HttpError(409, "An account with that email already exists.");
    throw error;
  }
  const account = toCustomerAccount(result.rows[0]);
  const session = await createSessionForCustomer(account.id);
  return { account, ...session };
};

const listCustomerAccounts = async () => {
  const result = await db.query(`SELECT ${ACCOUNT_COLUMNS} FROM customer_accounts ORDER BY created_at DESC`);
  return result.rows.map(toCustomerAccount);
};

const authenticateCustomer = async ({ email, password } = {}) => {
  const normalizedEmail = normalizeEmail(email);
  if (!validateEmail(normalizedEmail) || !password) throw new HttpError(401, "Invalid email or password.");

  const result = await db.query(`SELECT ${ACCOUNT_COLUMNS}, password_salt FROM customer_accounts WHERE email = $1`, [normalizedEmail]);
  const row = result.rows[0];

  if (!row || !row.password_hash) {
    await burnPasswordCheck(password);
    throw new HttpError(401, "Invalid email or password.");
  }
  if (!(await passwordsMatch(password, row.password_salt, row.password_hash))) {
    throw new HttpError(401, "Invalid email or password.");
  }

  const session = await createSessionForCustomer(row.id);
  return { account: toCustomerAccount(row), ...session };
};

const verifyGoogleToken = async (idToken) => {
  if (!idToken || typeof idToken !== "string") throw new HttpError(400, "Missing Google credential.");
  if (!env.googleClientId) throw new HttpError(500, "Google sign-in is not configured.");
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: env.googleClientId });
    payload = ticket.getPayload();
  } catch (_error) {
    throw new HttpError(401, "Could not verify your Google sign-in.");
  }
  if (!payload || !payload.email_verified) throw new HttpError(401, "Your Google account's email is not verified.");
  return payload;
};

const authenticateWithGoogle = async (idToken) => {
  const payload = await verifyGoogleToken(idToken);
  const googleId = payload.sub;
  const email = normalizeEmail(payload.email);
  const name = String(payload.name || email.split("@")[0] || "Customer").trim().slice(0, 100);

  let result = await db.query(`SELECT ${ACCOUNT_COLUMNS} FROM customer_accounts WHERE google_id = $1`, [googleId]);

  if (!result.rows[0]) {
    result = await db.query(`SELECT ${ACCOUNT_COLUMNS} FROM customer_accounts WHERE email = $1`, [email]);
    const existing = result.rows[0];

    if (existing && !existing.google_id) {
      if (existing.email_verified) {
        // The account already proved it owns this email: safe to link.
        result = await db.query(
          `UPDATE customer_accounts SET google_id = $1 WHERE id = $2 RETURNING ${ACCOUNT_COLUMNS}`,
          [googleId, existing.id]
        );
      } else {
        // The password on this account was never proven to belong to the email owner —
        // someone may have registered it first to hijack the account later. Google has
        // now proven who owns the email, so they take over: the unproven password and
        // every existing session are removed. The owner can set a new password anytime.
        result = await db.query(
          `UPDATE customer_accounts SET google_id = $1, password_hash = NULL, password_salt = NULL,
             email_verified = TRUE, email_verified_at = NOW()
           WHERE id = $2 RETURNING ${ACCOUNT_COLUMNS}`,
          [googleId, existing.id]
        );
        await db.query("DELETE FROM customer_sessions WHERE customer_account_id = $1", [existing.id]);
      }
    }
  }

  if (!result.rows[0]) {
    result = await db.query(
      `INSERT INTO customer_accounts (id, name, email, google_id, email_verified, email_verified_at)
       VALUES ($1, $2, $3, $4, TRUE, NOW())
       RETURNING ${ACCOUNT_COLUMNS}`,
      [`customer_${crypto.randomUUID()}`, name, email, googleId]
    );
  }

  const account = toCustomerAccount(result.rows[0]);
  const session = await createSessionForCustomer(account.id);
  return { account, ...session };
};

const getCustomerBySessionToken = async (token) => {
  if (!token) return null;
  const result = await db.query(
    `SELECT customer_sessions.id AS session_id, ${ACCOUNT_COLUMNS.split(", ").map((column) => "customer_accounts." + column).join(", ")}
     FROM customer_sessions
     INNER JOIN customer_accounts ON customer_accounts.id = customer_sessions.customer_account_id
     WHERE customer_sessions.token_hash = $1 AND customer_sessions.expires_at > NOW()`,
    [hashToken(token)]
  );
  const row = result.rows[0];
  if (!row) return null;
  await db.query("UPDATE customer_sessions SET last_seen_at = NOW() WHERE id = $1", [row.session_id]);
  return toCustomerAccount(row);
};

const destroyCustomerSession = async (token) => {
  if (!token) return;
  await db.query("DELETE FROM customer_sessions WHERE token_hash = $1", [hashToken(token)]);
};

const updateProfile = async (accountId, { name, phone }) => {
  const normalizedName = String(name || "").trim();
  if (normalizedName.length < 2) throw new HttpError(400, "Your name must be at least 2 characters.");
  if (normalizedName.length > 100) throw new HttpError(400, "Your name is too long.");

  const result = await db.query(
    `UPDATE customer_accounts SET name = $1, phone = $2 WHERE id = $3 RETURNING ${ACCOUNT_COLUMNS}`,
    [normalizedName, normalizePhone(phone) || null, accountId]
  );
  if (!result.rows[0]) throw new HttpError(404, "Account not found.");
  return toCustomerAccount(result.rows[0]);
};

const updateProfileImage = async (accountId, profileImageUrl) => {
  const result = await db.query(
    `UPDATE customer_accounts SET profile_image_url = $1 WHERE id = $2 RETURNING ${ACCOUNT_COLUMNS}`,
    [profileImageUrl, accountId]
  );
  if (!result.rows[0]) throw new HttpError(404, "Account not found.");
  return toCustomerAccount(result.rows[0]);
};

const setOrChangePassword = async (accountId, { currentPassword, newPassword }, { keepSessionToken } = {}) => {
  const result = await db.query(`SELECT email, password_hash, password_salt FROM customer_accounts WHERE id = $1`, [accountId]);
  const row = result.rows[0];
  if (!row) throw new HttpError(404, "Account not found.");

  if (row.password_hash) {
    if (!currentPassword || !(await passwordsMatch(currentPassword, row.password_salt, row.password_hash))) {
      throw new HttpError(401, "Your current password is incorrect.");
    }
  }
  await assertStrongPassword(newPassword, row.email);

  const credentials = await hashPassword(newPassword);
  await db.query(`UPDATE customer_accounts SET password_hash = $1, password_salt = $2 WHERE id = $3`, [
    credentials.hash,
    credentials.salt,
    accountId,
  ]);
  // Sign out other devices.
  await db.query("DELETE FROM customer_sessions WHERE customer_account_id = $1 AND token_hash <> $2", [
    accountId,
    keepSessionToken ? hashToken(keepSessionToken) : "",
  ]);
};

const linkGoogleAccount = async (accountId, idToken) => {
  const payload = await verifyGoogleToken(idToken);
  const googleId = payload.sub;
  const existing = await db.query("SELECT id FROM customer_accounts WHERE google_id = $1", [googleId]);
  if (existing.rows[0] && existing.rows[0].id !== accountId) {
    throw new HttpError(409, "That Google account is already linked to a different Vibecraft account.");
  }

  const result = await db.query(
    `UPDATE customer_accounts
     SET google_id = $1,
         email_verified = email_verified OR (LOWER(email) = LOWER($3)),
         email_verified_at = CASE WHEN NOT email_verified AND LOWER(email) = LOWER($3) THEN NOW() ELSE email_verified_at END
     WHERE id = $2
     RETURNING ${ACCOUNT_COLUMNS}`,
    [googleId, accountId, normalizeEmail(payload.email)]
  );
  return toCustomerAccount(result.rows[0]);
};

const unlinkGoogleAccount = async (accountId) => {
  const result = await db.query("SELECT password_hash FROM customer_accounts WHERE id = $1", [accountId]);
  const row = result.rows[0];
  if (!row) throw new HttpError(404, "Account not found.");
  if (!row.password_hash) {
    throw new HttpError(400, "Set a password before unlinking Google, so you don't lose access to your account.");
  }
  const updated = await db.query(`UPDATE customer_accounts SET google_id = NULL WHERE id = $1 RETURNING ${ACCOUNT_COLUMNS}`, [accountId]);
  return toCustomerAccount(updated.rows[0]);
};

module.exports = {
  authenticateCustomer,
  authenticateWithGoogle,
  createEmailVerificationToken,
  destroyCustomerSession,
  getCustomerBySessionToken,
  linkGoogleAccount,
  listCustomerAccounts,
  setOrChangePassword,
  signupCustomer,
  unlinkGoogleAccount,
  updateProfile,
  updateProfileImage,
  verifyEmailToken,
};
