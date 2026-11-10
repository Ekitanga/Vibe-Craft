// AES-256-GCM encryption for integration secrets stored in the database.
//
// Key source, in order of preference:
//   1. SETTINGS_ENCRYPTION_KEY environment variable (recommended for production).
//   2. A random key generated once and stored in the app_secrets table. This still
//      keeps secrets out of plain-text exports of the settings table, but anyone with
//      full database access can decrypt them, so the admin UI warns until (1) is set.
// Every ciphertext records which key encrypted it, so switching to an env key later
// keeps old values readable; they are re-encrypted the next time they are saved.
const crypto = require("crypto");
const env = require("../config/env");

let dbKeyPromise = null;

const keyFromMaterial = (material) => crypto.createHash("sha256").update(String(material)).digest();

const loadDbKey = async (db) => {
  if (!dbKeyPromise) {
    dbKeyPromise = (async () => {
      const generated = crypto.randomBytes(32).toString("base64");
      await db.query(
        `INSERT INTO app_secrets (name, value) VALUES ('settings_encryption_key', $1)
         ON CONFLICT (name) DO NOTHING`,
        [generated]
      );
      const result = await db.query("SELECT value FROM app_secrets WHERE name = 'settings_encryption_key'");
      return keyFromMaterial(result.rows[0].value);
    })().catch((error) => {
      dbKeyPromise = null;
      throw error;
    });
  }
  return dbKeyPromise;
};

const keySource = () => (env.settingsEncryptionKey ? "env" : "db");

const getKey = async (db, source) => {
  if (source === "env") {
    if (!env.settingsEncryptionKey) {
      throw new Error("A secret was encrypted with SETTINGS_ENCRYPTION_KEY but that variable is no longer set.");
    }
    return keyFromMaterial(env.settingsEncryptionKey);
  }
  return loadDbKey(db);
};

const encrypt = async (db, plainObject) => {
  const source = keySource();
  const key = await getKey(db, source);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(plainObject || {}), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", source, iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
};

const decrypt = async (db, payload) => {
  if (!payload) return {};
  const [version, source, iv, tag, data] = String(payload).split(":");
  if (version !== "v1") throw new Error("Unknown secret format.");
  const key = await getKey(db, source);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  return JSON.parse(plain);
};

const resetCache = () => {
  dbKeyPromise = null;
};

module.exports = { decrypt, encrypt, keySource, resetCache };
