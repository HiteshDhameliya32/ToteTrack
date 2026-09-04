/**
 * Fresh Database Reset & Migration Script (SQLite / sql.js).
 *
 * Steps:
 *   1. Closes any lingering connections and removes existing tcp_logs.db
 *   2. Initializes fresh schema with all tables and columns
 *   3. Seeds Super Admin, permissions, default company, and SMTP from .env
 *   4. Verifies all tables
 */

const path = require("path");
const fs   = require("fs");

const rootDir = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(rootDir, ".env") });

const DB_PATH = path.resolve(rootDir, process.env.DB_PATH || "tcp_logs.db");

async function resetDatabase() {
  console.log("============================================================");
  console.log("             FRESH DATABASE RESET & MIGRATION               ");
  console.log("============================================================");

  // 1. Delete existing database file if it exists
  if (fs.existsSync(DB_PATH)) {
    try {
      fs.unlinkSync(DB_PATH);
      console.log(`✓ Removed old database file: ${DB_PATH}`);
    } catch (err) {
      console.warn(`[WARN] Could not remove old db file directly (${err.message}). Overwriting instead.`);
    }
  }

  // 2. Initialize fresh schema and seed data
  console.log("[INFO] Creating fresh database and running migrations...");
  const initSchema = require("../TCP-Email/src/models/schema");
  await initSchema();
  console.log("✓ All tables created and migrated successfully.");

  // 3. Verify tables
  const db = require("../TCP-Email/src/config/db");
  const [tables] = await db.query(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  );
  console.log(`✓ Total tables created: ${tables.length}`);
  console.log("Tables:", tables.map(t => t.name).join(", "));

  console.log("============================================================");
  console.log("      FRESH DATABASE IS READY (Super Admin: superadmin@tcp.com)");
  console.log("============================================================");
}

resetDatabase().catch(err => {
  console.error("[ERROR] Failed to reset database:", err);
  process.exitCode = 1;
});
