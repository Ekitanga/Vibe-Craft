const adminAuthService = require("../services/adminAuthService");
const db = require("./postgres");

const getArgValue = (name) => {
  const prefix = `--${name}=`;
  const exactIndex = process.argv.indexOf(`--${name}`);
  const inlineValue = process.argv.find((arg) => arg.startsWith(prefix));

  if (inlineValue) {
    return inlineValue.slice(prefix.length);
  }

  if (exactIndex !== -1) {
    return process.argv[exactIndex + 1];
  }

  return "";
};

const main = async () => {
  const email = getArgValue("email") || process.env.ADMIN_EMAIL;
  const password = getArgValue("password") || process.env.ADMIN_PASSWORD;
  const name = getArgValue("name") || process.env.ADMIN_NAME || "Vibecraft Admin";
  const role = getArgValue("role") || process.env.ADMIN_ROLE || "owner";
  const admin = await adminAuthService.createAdminUser({ email, password, name, role });

  console.log(
    JSON.stringify(
      {
        success: true,
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
        },
      },
      null,
      2
    )
  );
};

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.pool.end();
  });
