// Syntax-checks every server and client script (used by `npm run check` and CI).
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const roots = [path.join(__dirname, "..", "src"), path.join(__dirname, "..", "test"), path.join(__dirname, "..", "..", "Client")];
const files = [];
const walk = (dir) => {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".js")) files.push(full);
  }
};
roots.forEach(walk);

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    failed += 1;
    console.error(String(error.stderr || error.message));
  }
}
console.log(`Checked ${files.length} files, ${failed} with syntax errors.`);
process.exitCode = failed ? 1 : 0;
