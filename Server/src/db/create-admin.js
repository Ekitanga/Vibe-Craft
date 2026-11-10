// Creates an admin from the command line (a trusted operator on the server):
//   npm run admin:create -- --email owner@example.com --password "a-strong-password" [--name "Name"] [--role owner]
// Add --reset to reset the password/role of an existing account (signs it out everywhere).
const { runMigrations } = require("./migrate");
const adminAuthService = require("../services/adminAuthService");
const db = require("./postgres");

const getArgValue = (name) => {
  const prefix = `--${name}=`;
  const exactIndex = process.argv.indexOf(`--${name}`);
  const inlineValue = process.argv.find((arg) => arg.startsWith(prefix));
  if (inlineValue) return inlineValue.slice(prefix.length);
  if (exactIndex !== -1) return process.argv[exactIndex + 1];
  return "";
};

const main = async () => {
  await runMigrations({ log: () => {} });
  const email = getArgValue("email") || process.env.ADMIN_EMAIL;
  const password = getArgValue("password") || process.env.ADMIN_PASSWORD;
  const name = getArgValue("name") || process.env.ADMIN_NAME || "Vibecraft Admin";
  const role = getArgValue("role") || process.env.ADMIN_ROLE || "owner";
  const resetExisting = process.argv.includes("--reset");
  const admin = await adminAuthService.createAdminUser({ email, password, name, role, resetExisting });

  console.log(JSON.stringify({ success: true, admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role } }, null, 2));
};

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end();
  });
