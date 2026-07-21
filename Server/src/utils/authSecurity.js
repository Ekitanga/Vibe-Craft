const crypto = require("crypto");

const PASSWORD_KEY_LENGTH = 64;
const SESSION_TOKEN_BYTES = 32;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const validateEmail = (email) => EMAIL_PATTERN.test(email);

const hashPassword = (password, salt = crypto.randomBytes(16).toString("hex")) => ({
  hash: crypto.scryptSync(String(password), salt, PASSWORD_KEY_LENGTH).toString("hex"),
  salt,
});

const passwordsMatch = (password, salt, expectedHash) => {
  const actual = crypto.scryptSync(String(password), salt, PASSWORD_KEY_LENGTH);
  const expected = Buffer.from(String(expectedHash || ""), "hex");

  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
};

const createSessionToken = () => crypto.randomBytes(SESSION_TOKEN_BYTES).toString("hex");

const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

const createExpiryDate = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

module.exports = {
  createExpiryDate,
  createSessionToken,
  hashPassword,
  hashToken,
  normalizeEmail,
  passwordsMatch,
  validateEmail,
};
