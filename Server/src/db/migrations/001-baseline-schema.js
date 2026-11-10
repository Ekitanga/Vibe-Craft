// Baseline: the full schema from postgres-schema.sql. Every statement is
// IF NOT EXISTS / DROP-then-CREATE, so it is a no-op on existing databases.
const fs = require("fs");
const path = require("path");

exports.up = async (client) => {
  const sql = fs
    .readFileSync(path.join(__dirname, "..", "postgres-schema.sql"), "utf8")
    .replace(/^\s*BEGIN;\s*$/m, "")
    .replace(/^\s*COMMIT;\s*$/m, "");
  await client.query(sql);
};
