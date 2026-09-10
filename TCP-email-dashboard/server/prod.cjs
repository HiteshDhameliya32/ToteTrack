const { spawn } = require("child_process");
const path = require("path");
const logger = require("./logger.cjs");

const dashboardDir = path.resolve(__dirname, "..");

logger.info("Dashboard: building for production...");

// Step 1: build
const build = spawn("npm", ["run", "build"], {
  cwd: dashboardDir,
  shell: true,
  env: { ...process.env },
});

build.stdout.on("data", (d) => { const m = d.toString().trim(); if (m) logger.info(m); });
build.stderr.on("data", (d) => { const m = d.toString().trim(); if (m) logger.error(m); });

build.on("exit", (code) => {
  if (code !== 0) {
    logger.error(`Dashboard build failed (exit code ${code})`);
    process.exit(1);
  }

  logger.info("Dashboard: build complete — starting preview server...");

  // Step 2: preview the built dist
  const preview = spawn("npm", ["run", "preview"], {
    cwd: dashboardDir,
    shell: true,
    env: { ...process.env },
  });

  preview.stdout.on("data", (d) => {
    const m = d.toString().trim();
    if (!m) return;
    if (/error/i.test(m)) logger.error(m);
    else logger.info(m);
  });

  preview.stderr.on("data", (d) => {
    const m = d.toString().trim();
    if (m) logger.error(m);
  });

  preview.on("exit", (code) => {
    if (code !== 0) logger.error(`Dashboard preview exited with code ${code}`);
  });

  process.on("SIGINT", () => { preview.kill(); process.exit(); });
});

process.on("SIGINT", () => { build.kill(); process.exit(); });
