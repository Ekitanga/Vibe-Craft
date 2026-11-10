const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);

const PASSWORD_KEY_LENGTH = 64;
const SESSION_TOKEN_BYTES = 32;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A short deny-list of the passwords attackers try first. Kept small on purpose;
// the length rule and rate limiting do most of the work.
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "12345678", "123456789", "1234567890",
  "qwerty123", "qwertyuiop", "11111111", "00000000", "iloveyou", "admin123", "administrator", "letmein1",
  "welcome1", "vibecraft", "vibecraft254", "changeme", "change-this-password", "abc12345", "football",
]);

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const validateEmail = (email) => EMAIL_PATTERN.test(email) && email.length <= 254;

const derive = async (password, salt) => scrypt(String(password), salt, PASSWORD_KEY_LENGTH);

// Async scrypt keeps the event loop free while hashing (the old scryptSync blocked
// every request during a login flood). Parameters are unchanged, so existing hashes verify.
const hashPassword = async (password, salt = crypto.randomBytes(16).toString("hex")) => ({
  hash: (await derive(password, salt)).toString("hex"),
  salt,
});

const passwordsMatch = async (password, salt, expectedHash) => {
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  const actual = await derive(password, String(salt || ""));
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
};

// A fixed dummy hash so unknown-email logins cost the same time as real ones.
const DUMMY_SALT = "0".repeat(32);
let dummyHash = null;
const burnPasswordCheck = async (password) => {
  if (!dummyHash) dummyHash = (await hashPassword("dummy-password", DUMMY_SALT)).hash;
  await passwordsMatch(password || "x", DUMMY_SALT, dummyHash);
  return false;
};

const passwordProblem = (password, { minLength = 8, email = "" } = {}) => {
  const value = String(password || "");
  if (value.length < minLength) return `Password must be at least ${minLength} characters.`;
  if (value.length > 200) return "Password is too long.";
  if (COMMON_PASSWORDS.has(value.toLowerCase())) return "That password is too common. Choose something harder to guess.";
  const local = normalizeEmail(email).split("@")[0];
  if (local && local.length >= 4 && value.toLowerCase().includes(local)) return "Password should not contain your email name.";
  return null;
};

const createSessionToken = () => crypto.randomBytes(SESSION_TOKEN_BYTES).toString("hex");

const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

const createExpiryDate = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

module.exports = {
  burnPasswordCheck,
  createExpiryDate,
  createSessionToken,
  hashPassword,
  hashToken,
  normalizeEmail,
  passwordProblem,
  passwordsMatch,
  validateEmail,
};
