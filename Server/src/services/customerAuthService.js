const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
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

const googleClient = new OAuth2Client(env.googleClientId);

const normalizePhone = (phone) => String(phone || "").trim();

const toCustomerAccount = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  hasPassword: Boolean(row.password_hash),
  hasGoogleLinked: Boolean(row.google_id),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const validateSignupPayload = ({ name, email, password }) => {
  const normalizedName = String(name || "").trim();
  const normalizedEmail = normalizeEmail(email);

  if (normalizedName.length < 2) {
    throw new HttpError(400, "Your name must be at least 2 characters.");
  }

  if (!validateEmail(normalizedEmail)) {
    throw new HttpError(400, "A valid email is required.");
  }

  if (!password || String(password).length < 8) {
    throw new HttpError(400, "Password must be at least 8 characters.");
  }

  return {
    email: normalizedEmail,
    name: normalizedName,
  };
};

const cleanupExpiredSessions = async () => {
  await db.query("DELETE FROM customer_sessions WHERE expires_at <= NOW()");
};

const createSessionForCustomer = async (customerId) => {
  await cleanupExpiredSessions();

  const token = createSessionToken();
  const expiresAt = createExpiryDate(env.customerSessionDays);

  await db.query(
    `INSERT INTO customer_sessions (id, customer_account_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [`customer_session_${crypto.randomUUID()}`, customerId, hashToken(token), expiresAt.toISOString()]
  );

  return {
    token,
    expiresAt: expiresAt.toISOString(),
  };
};

const signupCustomer = async ({ name, email, phone, password }) => {
  const normalized = validateSignupPayload({ name, email, password });
  const existing = await db.query("SELECT id FROM customer_accounts WHERE email = $1", [normalized.email]);

  if (existing.rows[0]) {
    throw new HttpError(409, "An account with that email already exists.");
  }

  const credentials = hashPassword(password);
  const result = await db.query(
    `INSERT INTO customer_accounts (id, name, email, phone, password_hash, password_salt)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, email, phone, password_hash, google_id, created_at, updated_at`,
    [
      `customer_${crypto.randomUUID()}`,
      normalized.name,
      normalized.email,
      normalizePhone(phone) || null,
      credentials.hash,
      credentials.salt,
    ]
  );
  const account = toCustomerAccount(result.rows[0]);
  const session = await createSessionForCustomer(account.id);

  return {
    account,
    ...session,
  };
};

const authenticateCustomer = async ({ email, password }) => {
  const normalizedEmail = normalizeEmail(email);

  if (!validateEmail(normalizedEmail) || !password) {
    throw new HttpError(401, "Invalid email or password.");
  }

  const result = await db.query(
    `SELECT id, name, email, phone, password_hash, password_salt, google_id, created_at, updated_at
     FROM customer_accounts
     WHERE email = $1`,
    [normalizedEmail]
  );
  const row = result.rows[0];

  if (!row || !row.password_hash || !passwordsMatch(password, row.password_salt, row.password_hash)) {
    throw new HttpError(401, "Invalid email or password.");
  }

  const session = await createSessionForCustomer(row.id);

  return {
    account: toCustomerAccount(row),
    ...session,
  };
};

const authenticateWithGoogle = async (idToken) => {
  if (!idToken) {
    throw new HttpError(400, "Missing Google credential.");
  }

  if (!env.googleClientId) {
    throw new HttpError(500, "Google sign-in is not configured.");
  }

  let payload;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.googleClientId,
    });
    payload = ticket.getPayload();
  } catch (_error) {
    throw new HttpError(401, "Could not verify your Google sign-in.");
  }

  if (!payload || !payload.email_verified) {
    throw new HttpError(401, "Your Google account's email is not verified.");
  }

  const googleId = payload.sub;
  const email = normalizeEmail(payload.email);
  const name = String(payload.name || email.split("@")[0] || "Customer").trim();

  let result = await db.query(
    `SELECT id, name, email, phone, password_hash, google_id, created_at, updated_at
     FROM customer_accounts
     WHERE google_id = $1`,
    [googleId]
  );

  if (!result.rows[0]) {
    result = await db.query(
      `SELECT id, name, email, phone, password_hash, google_id, created_at, updated_at
       FROM customer_accounts
       WHERE email = $1`,
      [email]
    );

    if (result.rows[0] && !result.rows[0].google_id) {
      await db.query("UPDATE customer_accounts SET google_id = $1, updated_at = NOW() WHERE id = $2", [
        googleId,
        result.rows[0].id,
      ]);
      result.rows[0].google_id = googleId;
    }
  }

  if (!result.rows[0]) {
    result = await db.query(
      `INSERT INTO customer_accounts (id, name, email, google_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, phone, password_hash, google_id, created_at, updated_at`,
      [`customer_${crypto.randomUUID()}`, name, email, googleId]
    );
  }

  const account = toCustomerAccount(result.rows[0]);
  const session = await createSessionForCustomer(account.id);

  return {
    account,
    ...session,
  };
};

const getCustomerBySessionToken = async (token) => {
  if (!token) {
    return null;
  }

  const result = await db.query(
    `SELECT
       customer_sessions.id AS session_id,
       customer_accounts.id,
       customer_accounts.name,
       customer_accounts.email,
       customer_accounts.phone,
       customer_accounts.password_hash,
       customer_accounts.google_id,
       customer_accounts.created_at,
       customer_accounts.updated_at
     FROM customer_sessions
     INNER JOIN customer_accounts ON customer_accounts.id = customer_sessions.customer_account_id
     WHERE customer_sessions.token_hash = $1
       AND customer_sessions.expires_at > NOW()`,
    [hashToken(token)]
  );
  const row = result.rows[0];

  if (!row) {
    return null;
  }

  await db.query("UPDATE customer_sessions SET last_seen_at = NOW() WHERE id = $1", [row.session_id]);

  return toCustomerAccount(row);
};

const destroyCustomerSession = async (token) => {
  if (!token) {
    return;
  }

  await db.query("DELETE FROM customer_sessions WHERE token_hash = $1", [hashToken(token)]);
};

const updateProfile = async (accountId, { name, phone }) => {
  const normalizedName = String(name || "").trim();

  if (normalizedName.length < 2) {
    throw new HttpError(400, "Your name must be at least 2 characters.");
  }

  const result = await db.query(
    `UPDATE customer_accounts
     SET name = $1, phone = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING id, name, email, phone, password_hash, google_id, created_at, updated_at`,
    [normalizedName, normalizePhone(phone) || null, accountId]
  );

  if (!result.rows[0]) {
    throw new HttpError(404, "Account not found.");
  }

  return toCustomerAccount(result.rows[0]);
};

const setOrChangePassword = async (accountId, { currentPassword, newPassword }) => {
  if (!newPassword || String(newPassword).length < 8) {
    throw new HttpError(400, "New password must be at least 8 characters.");
  }

  const result = await db.query(
    `SELECT password_hash, password_salt FROM customer_accounts WHERE id = $1`,
    [accountId]
  );
  const row = result.rows[0];

  if (!row) {
    throw new HttpError(404, "Account not found.");
  }

  if (row.password_hash) {
    if (!currentPassword || !passwordsMatch(currentPassword, row.password_salt, row.password_hash)) {
      throw new HttpError(401, "Your current password is incorrect.");
    }
  }

  const credentials = hashPassword(newPassword);

  await db.query(
    `UPDATE customer_accounts SET password_hash = $1, password_salt = $2, updated_at = NOW() WHERE id = $3`,
    [credentials.hash, credentials.salt, accountId]
  );
};

const linkGoogleAccount = async (accountId, idToken) => {
  if (!idToken) {
    throw new HttpError(400, "Missing Google credential.");
  }

  if (!env.googleClientId) {
    throw new HttpError(500, "Google sign-in is not configured.");
  }

  let payload;

  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: env.googleClientId });
    payload = ticket.getPayload();
  } catch (_error) {
    throw new HttpError(401, "Could not verify your Google sign-in.");
  }

  if (!payload || !payload.email_verified) {
    throw new HttpError(401, "Your Google account's email is not verified.");
  }

  const googleId = payload.sub;
  const existing = await db.query("SELECT id FROM customer_accounts WHERE google_id = $1", [googleId]);

  if (existing.rows[0] && existing.rows[0].id !== accountId) {
    throw new HttpError(409, "That Google account is already linked to a different Vibecraft account.");
  }

  const result = await db.query(
    `UPDATE customer_accounts
     SET google_id = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, name, email, phone, password_hash, google_id, created_at, updated_at`,
    [googleId, accountId]
  );

  return toCustomerAccount(result.rows[0]);
};

const unlinkGoogleAccount = async (accountId) => {
  const result = await db.query("SELECT password_hash FROM customer_accounts WHERE id = $1", [accountId]);
  const row = result.rows[0];

  if (!row) {
    throw new HttpError(404, "Account not found.");
  }

  if (!row.password_hash) {
    throw new HttpError(400, "Set a password before unlinking Google, so you don't lose access to your account.");
  }

  const updated = await db.query(
    `UPDATE customer_accounts
     SET google_id = NULL, updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, email, phone, password_hash, google_id, created_at, updated_at`,
    [accountId]
  );

  return toCustomerAccount(updated.rows[0]);
};

module.exports = {
  authenticateCustomer,
  authenticateWithGoogle,
  destroyCustomerSession,
  getCustomerBySessionToken,
  linkGoogleAccount,
  setOrChangePassword,
  signupCustomer,
  unlinkGoogleAccount,
  updateProfile,
};
