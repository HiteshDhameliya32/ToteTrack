/**
 * Pre-start production validation (SQLite / sql.js edition).
 *
 * Checks:
 *   1. .env file exists
 *   2. tcp_logs.db exists  →  if not, runs initSchema() to create it
 *   3. All 15 required tables are present
 *
 * Does NOT call process.exit() — sets process.exitCode and returns so that
 * Node.js can clean up sql.js WASM handles naturally and avoid the libuv
 * UV_HANDLE_CLOSING assertion crash on Windows.
 */

const path = require("path");
const fs   = require("fs");

const rootDir = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(rootDir, ".env") });

const DB_PATH = path.resolve(rootDir, process.env.DB_PATH || "tcp_logs.db");

const requiredTables = [
  "camera_configs", "tcp_logs", "app_settings",
  "companies", "users", "permissions", "user_permissions",
  "audit_logs", "email_schedules", "email_recipients",
  "smtp_settings", "email_logs", "system_notifications",
  "tcp_messages", "user_tcp_configs",
];

async function run() {
  console.log("============================================================");
  console.log("             PRE-START PRODUCTION VALIDATION                ");
  console.log("============================================================");

  // 1. Check .env
  if (!fs.existsSync(path.join(rootDir, ".env"))) {
    console.error("[ERROR] .env file is missing. Please create it or run setup.bat.");
    process.exitCode = 1;
    return;
  }
  console.log("✓ Environment file (.env) found.");

  // 2. If database file doesn't exist, run migrations to create it automatically
  if (!fs.existsSync(DB_PATH)) {
    console.log(`[INFO] SQLite database not found at: ${DB_PATH}`);
    console.log("[INFO] Running schema migrations to create database...");
    try {
      const initSchema = require("../TCP-Email/src/models/schema");
      await initSchema();
      console.log("✓ Database created and migrated successfully.");
    } catch (err) {
      console.error("[ERROR] Failed to create database:", err.message);
      console.error("Please run setup.bat first.");
      process.exitCode = 1;
      return;
    }
  } else {
    console.log(`✓ SQLite database found: ${DB_PATH}`);
  }

  // 3. Query tables via the db adapter (sql.js — pure JS, no MySQL needed)
  try {
    const db = require("../TCP-Email/src/config/db");

    const [tables] = await db.query(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const existingTables = tables.map(r => r.name.toLowerCase());

    const missingTables = requiredTables.filter(
      t => !existingTables.includes(t.toLowerCase())
    );

    if (missingTables.length > 0) {
      console.error("[ERROR] Validation failed. Missing required tables:");
      missingTables.forEach(t => console.error(`  - ${t}`));
      console.error("\nPlease run setup.bat to install dependencies and run migrations.");
      process.exitCode = 1;
      return;
    }

    console.log(`✓ All ${requiredTables.length} required tables verified successfully.`);
    console.log("✓ Database is fully migrated and ready.");
    console.log("============================================================");
    console.log("               PRODUCTION READY TO START                    ");
    console.log("============================================================");
    // No process.exit() — let Node exit naturally once WASM handles are released
  } catch (err) {
    console.error("[ERROR] Database check failed:", err.message);
    console.error("Please run setup.bat first.");
    process.exitCode = 1;
  }
}

run().catch(err => {
  console.error("[ERROR] Unexpected failure during pre-start validation:", err.message);
  process.exitCode = 1;
});
