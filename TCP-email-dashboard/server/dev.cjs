const { spawn } = require("child_process");
const path = require("path");
const logger = require("./logger.cjs");

logger.info("Dashboard server starting...");

const vite = spawn("npm", ["run", "dev"], {
  cwd: path.resolve(__dirname, ".."),
  shell: true,
  env: { ...process.env },
});

vite.stdout.on("data", (data) => {
  const msg = data.toString().trim();
  if (!msg) return;
  if (/error/i.test(msg)) logger.error(msg);
  else logger.info(msg);
});

vite.stderr.on("data", (data) => {
  const msg = data.toString().trim();
  if (msg) logger.error(msg);
});

vite.on("exit", (code) => {
  if (code !== 0) logger.error(`Vite process exited with code ${code}`);
});

process.on("SIGINT", () => {
  vite.kill();
  process.exit();
});
