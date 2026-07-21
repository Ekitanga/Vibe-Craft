const app = require("./app");
const env = require("./config/env");
const adminAuthService = require("./services/adminAuthService");

const ensureBootstrapAdmin = async () => {
  if (!env.adminEmail || !env.adminPassword) {
    return;
  }

  try {
    await adminAuthService.createAdminUser({
      email: env.adminEmail,
      password: env.adminPassword,
      name: env.adminName,
    });
    console.log(`Bootstrap admin ensured: ${env.adminEmail}`);
  } catch (error) {
    console.error("Could not ensure bootstrap admin:", error.message || error);
  }
};

ensureBootstrapAdmin().finally(() => {
  app.listen(env.port, "0.0.0.0", () => {
    console.log(`Vibecraft API listening on port ${env.port}`);
  });
});
