const { Pool } = require("pg");
const env = require("../config/env");

const sslConfig = env.pgSsl ? { rejectUnauthorized: false } : false;

const cleanConnectionString = (connectionString) => {
  if (!connectionString) {
    return connectionString;
  }

  try {
    const url = new URL(connectionString);
    ["sslmode", "sslcert", "sslkey", "sslrootcert"].forEach((parameter) => url.searchParams.delete(parameter));
    return url.toString();
  } catch (_error) {
    return connectionString;
  }
};

const pool = new Pool(
  env.databaseUrl
    ? {
        connectionString: cleanConnectionString(env.databaseUrl),
        ssl: sslConfig,
      }
    : {
        host: env.pgHost,
        port: env.pgPort,
        database: env.pgDatabase,
        user: env.pgUser,
        password: env.pgPassword,
        ssl: sslConfig,
      }
);

pool.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error", error);
});

const query = (text, params) => pool.query(text, params);

const withTransaction = async (callback) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");

    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  query,
  withTransaction,
};
