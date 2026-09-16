/**
 * migrate.js — Idempotent database migration script
 *
 * Runs all CREATE TABLE IF NOT EXISTS and ALTER TABLE ADD COLUMN (if missing)
 * statements against tcp_logs.db.
 *
 * Safe to run multiple times — will never drop data or overwrite existing rows.
 *
 * Usage:
 *   node scripts/migrate.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const path      = require("path");
const fs        = require("fs");
const initSqlJs = require("sql.js");

const DB_PATH = path.resolve(__dirname, "../tcp_logs.db");

async function run() {
  console.log("==========================================================");
  console.log(" ToteTrack — Database Migration");
  console.log(`  DB path : ${DB_PATH}`);
  console.log("==========================================================\n");

  const SQL = await initSqlJs();
  const buf = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  const db  = buf ? new SQL.Database(buf) : new SQL.Database();

  db.run("PRAGMA foreign_keys = ON;");

  // ── Helpers ──────────────────────────────────────────────────────────────
  function exec(sql, label) {
    try {
      db.run(sql);
      console.log(`  ✅  ${label}`);
    } catch (err) {
      console.error(`  ❌  ${label} — ${err.message}`);
    }
  }

  function columnExists(table, column) {
    try {
      const res = db.exec(`PRAGMA table_info(${table})`);
      if (!res.length) return false;
      return res[0].values.some(row => row[1] === column);
    } catch {
      return false;
    }
  }

  function tableExists(table) {
    try {
      const res = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`);
      return res.length > 0 && res[0].values.length > 0;
    } catch {
      return false;
    }
  }

  function addColumn(table, column, definition) {
    if (!tableExists(table)) {
      console.log(`  ⚠️   Skip column '${column}' — table '${table}' does not exist yet`);
      return;
    }
    if (columnExists(table, column)) {
      console.log(`  —    Column '${table}.${column}' already exists`);
      return;
    }
    try {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      console.log(`  ✅  Added column '${table}.${column}'`);
    } catch (err) {
      console.error(`  ❌  Add column '${table}.${column}' — ${err.message}`);
    }
  }

  // ── Tables ────────────────────────────────────────────────────────────────
  console.log("── Creating tables (if not exist) ──────────────────────────\n");

  exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      created_at TEXT    DEFAULT (datetime('now'))
    )`, "companies");

  exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL,
      name       TEXT    NOT NULL,
      email      TEXT    NOT NULL UNIQUE,
      password   TEXT    NOT NULL,
      role       TEXT    NOT NULL DEFAULT 'User'
                         CHECK(role IN ('Super Admin','Admin','User')),
      active     INTEGER DEFAULT 1,
      created_at TEXT    DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )`, "users");

  exec(`
    CREATE TABLE IF NOT EXISTS permissions (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT    NOT NULL UNIQUE,
      name TEXT    NOT NULL
    )`, "permissions");

  exec(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      UNIQUE(user_id, permission_id),
      FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    )`, "user_permissions");

  exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NULL,
      user_id    INTEGER NULL,
      action     TEXT    NOT NULL,
      entity     TEXT    NOT NULL,
      created_at TEXT    DEFAULT (datetime('now'))
    )`, "audit_logs");

  exec(`
    CREATE TABLE IF NOT EXISTS email_schedules (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      time       TEXT    NOT NULL,
      active     INTEGER DEFAULT 1,
      company_id INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    DEFAULT (datetime('now'))
    )`, "email_schedules");

  exec(`
    CREATE TABLE IF NOT EXISTS email_recipients (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT    NOT NULL UNIQUE,
      active     INTEGER DEFAULT 1,
      company_id INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    DEFAULT (datetime('now'))
    )`, "email_recipients");

  exec(`
    CREATE TABLE IF NOT EXISTS smtp_settings (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      host       TEXT    NOT NULL,
      port       INTEGER NOT NULL DEFAULT 587,
      user       TEXT    NOT NULL,
      pass       TEXT    NOT NULL,
      from_name  TEXT    NOT NULL DEFAULT 'ToteTrack',
      company_id INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT    DEFAULT (datetime('now'))
    )`, "smtp_settings");

  exec(`
    CREATE TABLE IF NOT EXISTS email_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sent_at       TEXT    DEFAULT (datetime('now')),
      record_count  INTEGER DEFAULT 0,
      status        TEXT    DEFAULT 'success'
                            CHECK(status IN ('success','failed','skipped')),
      error_message TEXT    NULL,
      date_from     TEXT    NULL,
      date_to       TEXT    NULL,
      action        TEXT    NULL,
      recipients    TEXT    NULL,
      company_id    INTEGER NOT NULL DEFAULT 1
    )`, "email_logs");

  exec(`
    CREATE TABLE IF NOT EXISTS system_notifications (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name TEXT    NOT NULL,
      severity     TEXT    NOT NULL DEFAULT 'info'
                           CHECK(severity IN ('info','warning','error','critical')),
      title        TEXT    NOT NULL DEFAULT '',
      message      TEXT    NOT NULL,
      is_read      INTEGER NOT NULL DEFAULT 0,
      company_id   INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT    DEFAULT (datetime('now'))
    )`, "system_notifications");

  exec(`
    CREATE TABLE IF NOT EXISTS tcp_messages (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      received_at   TEXT    DEFAULT (datetime('now')),
      message       TEXT,
      email_sent    INTEGER DEFAULT 0,
      email_sent_at TEXT    NULL
    )`, "tcp_messages");

  exec(`
    CREATE TABLE IF NOT EXISTS user_tcp_configs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL,
      host           TEXT    NOT NULL,
      port           INTEGER NOT NULL,
      is_active      INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT    DEFAULT (datetime('now')),
      UNIQUE(user_id, host, port)
    )`, "user_tcp_configs");

  exec(`
    CREATE TABLE IF NOT EXISTS tcp_zones (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      name       TEXT    NOT NULL,
      created_at TEXT    DEFAULT (datetime('now'))
    )`, "tcp_zones");

  exec(`
    CREATE TABLE IF NOT EXISTS tcp_zone_ports (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_id INTEGER NOT NULL,
      host    TEXT    NOT NULL,
      port    INTEGER NOT NULL,
      UNIQUE(zone_id, host, port),
      FOREIGN KEY(zone_id) REFERENCES tcp_zones(id) ON DELETE CASCADE
    )`, "tcp_zone_ports");

  exec(`
    CREATE TABLE IF NOT EXISTS camera_configs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_name TEXT    NOT NULL,
      ip_address  TEXT    NOT NULL,
      port        INTEGER NOT NULL,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    DEFAULT (datetime('now')),
      updated_at  TEXT    DEFAULT (datetime('now')),
      UNIQUE(ip_address, port)
    )`, "camera_configs");

  exec(`
    CREATE TABLE IF NOT EXISTS tcp_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id   INTEGER NULL,
      ip_address  TEXT    NOT NULL,
      port        INTEGER NOT NULL,
      message     TEXT    NOT NULL,
      received_at TEXT    DEFAULT (datetime('now')),
      FOREIGN KEY (camera_id) REFERENCES camera_configs(id) ON DELETE SET NULL
    )`, "tcp_logs");

  exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`, "app_settings");

  exec(`
    CREATE TABLE IF NOT EXISTS zone_cycles (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id          TEXT    NOT NULL UNIQUE,
      zone_id           INTEGER NOT NULL,
      zone_name         TEXT    NULL,
      started_at        TEXT    NOT NULL,
      completed_at      TEXT    NULL,
      status            TEXT    NULL CHECK(status IN ('PASS','NR')),
      barcode           TEXT    NULL,
      image_name        TEXT    NULL,
      first_record_id   INTEGER NOT NULL,
      completion_reason TEXT    NULL CHECK(completion_reason IN ('ALL_DEVICES_RECEIVED','TIMEOUT')),
      expected_devices  TEXT    NOT NULL,
      received_devices  TEXT    NOT NULL,
      email_sent        INTEGER NOT NULL DEFAULT 0,
      email_sent_at     TEXT    NULL,
      created_at        TEXT    DEFAULT (datetime('now'))
    )`, "zone_cycles");

  // ── Column migrations (safe — only adds missing columns) ─────────────────
  console.log("\n── Adding missing columns (if any) ─────────────────────────\n");

  addColumn("tcp_messages",        "company_id",    "INTEGER NOT NULL DEFAULT 1");
  addColumn("tcp_messages",        "port",          "INTEGER NULL");
  addColumn("tcp_messages",        "image",         "TEXT NULL");
  addColumn("tcp_messages",        "folder_path",   "TEXT NULL");
  addColumn("tcp_messages",        "barcode",       "TEXT NULL");
  addColumn("tcp_messages",        "zone_id",       "INTEGER NULL");
  addColumn("user_tcp_configs",    "folder_path",   "TEXT NULL");
  addColumn("user_tcp_configs",    "pair_id",       "INTEGER NOT NULL DEFAULT 0");
  addColumn("user_tcp_configs",    "folder_path_ok","TEXT NULL");
  addColumn("user_tcp_configs",    "folder_path_nr","TEXT NULL");
  addColumn("user_tcp_configs",    "zone_id",       "INTEGER NULL");
  addColumn("email_logs",          "company_id",    "INTEGER NOT NULL DEFAULT 1");
  addColumn("email_schedules",     "company_id",    "INTEGER NOT NULL DEFAULT 1");
  addColumn("email_recipients",    "company_id",    "INTEGER NOT NULL DEFAULT 1");
  addColumn("system_notifications","company_id",    "INTEGER NOT NULL DEFAULT 1");
  addColumn("smtp_settings",       "company_id",    "INTEGER NOT NULL DEFAULT 1");
  addColumn("zone_cycles",         "image_name",    "TEXT NULL");
  addColumn("zone_cycles",         "email_sent",    "INTEGER NOT NULL DEFAULT 0");
  addColumn("zone_cycles",         "email_sent_at", "TEXT NULL");
  addColumn("zone_cycles",         "zone_name",     "TEXT NULL");

  // ── Save to disk ──────────────────────────────────────────────────────────
  console.log("\n── Saving database ──────────────────────────────────────────\n");
  try {
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    console.log(`  ✅  Saved: ${DB_PATH}`);
  } catch (err) {
    console.error(`  ❌  Save failed: ${err.message}`);
    process.exit(1);
  }

  db.close();

  console.log("\n==========================================================");
  console.log(" Migration complete.");
  console.log("==========================================================\n");
}

run().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
