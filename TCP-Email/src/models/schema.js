/**
 * SQLite schema initialisation using sql.js (pure JavaScript, no native build).
 *
 * All tables are created with CREATE TABLE IF NOT EXISTS.
 * Columns are added with ALTER TABLE only when missing.
 * Seed data uses INSERT OR IGNORE so re-runs are safe.
 */

const db = require("../config/db");
const { hashPassword } = require("../utils/password");

async function initSchema() {
  // Get the raw sql.js DB instance for bulk DDL
  const sqlDb = await db._getDb();

  // ── Helper: add a column if it doesn't already exist ──────────────────────
  function columnExists(tableName, columnName) {
    const result = sqlDb.exec(`PRAGMA table_info(${tableName})`);
    if (!result.length) return false;
    return result[0].values.some(row => row[1] === columnName);
  }

  function addColumnIfNotExists(tableName, columnName, columnDefinition) {
    try {
      if (!columnExists(tableName, columnName)) {
        sqlDb.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
        console.log(`Column '${columnName}' added to table '${tableName}'`);
      }
    } catch (err) {
      console.error(`Error adding column '${columnName}' to '${tableName}':`, err.message);
    }
  }

  // ── Create Tables ──────────────────────────────────────────────────────────

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS companies (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL UNIQUE,
      created_at TEXT    DEFAULT (datetime('now'))
    )
  `);

  sqlDb.run(`
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
    )
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS permissions (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT    NOT NULL UNIQUE,
      name TEXT    NOT NULL
    )
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      permission_id INTEGER NOT NULL,
      UNIQUE(user_id, permission_id),
      FOREIGN KEY (user_id)       REFERENCES users(id)       ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    )
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NULL,
      user_id    INTEGER NULL,
      action     TEXT    NOT NULL,
      entity     TEXT    NOT NULL,
      created_at TEXT    DEFAULT (datetime('now'))
    )
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS email_schedules (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      time       TEXT    NOT NULL,
      active     INTEGER DEFAULT 1,
      created_at TEXT    DEFAULT (datetime('now'))
    )
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS email_recipients (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      email      TEXT    NOT NULL UNIQUE,
      active     INTEGER DEFAULT 1,
      created_at TEXT    DEFAULT (datetime('now'))
    )
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS smtp_settings (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      host       TEXT    NOT NULL,
      port       INTEGER NOT NULL DEFAULT 587,
      user       TEXT    NOT NULL,
      pass       TEXT    NOT NULL,
      from_name  TEXT    NOT NULL DEFAULT 'ToteTrack',
      updated_at TEXT    DEFAULT (datetime('now'))
    )
  `);

  sqlDb.run(`
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
      recipients    TEXT    NULL
    )
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS system_notifications (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name TEXT    NOT NULL,
      severity     TEXT    NOT NULL DEFAULT 'info'
                           CHECK(severity IN ('info','warning','error','critical')),
      title        TEXT    NOT NULL DEFAULT '',
      message      TEXT    NOT NULL,
      is_read      INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT    DEFAULT (datetime('now'))
    )
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS tcp_messages (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      received_at   TEXT    DEFAULT (datetime('now')),
      message       TEXT,
      email_sent    INTEGER DEFAULT 0,
      email_sent_at TEXT    NULL
    )
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS user_tcp_configs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL,
      host           TEXT    NOT NULL,
      port           INTEGER NOT NULL,
      is_active      INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT    DEFAULT (datetime('now')),
      UNIQUE(user_id, host, port)
    )
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS tcp_zones (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      name       TEXT    NOT NULL,
      created_at TEXT    DEFAULT (datetime('now'))
    )
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS tcp_zone_ports (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_id INTEGER NOT NULL,
      host    TEXT    NOT NULL,
      port    INTEGER NOT NULL,
      UNIQUE(zone_id, host, port),
      FOREIGN KEY(zone_id) REFERENCES tcp_zones(id) ON DELETE CASCADE
    )
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS camera_configs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_name TEXT    NOT NULL,
      ip_address  TEXT    NOT NULL,
      port        INTEGER NOT NULL,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    DEFAULT (datetime('now')),
      updated_at  TEXT    DEFAULT (datetime('now')),
      UNIQUE(ip_address, port)
    )
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS tcp_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      camera_id   INTEGER NULL,
      ip_address  TEXT    NOT NULL,
      port        INTEGER NOT NULL,
      message     TEXT    NOT NULL,
      received_at TEXT    DEFAULT (datetime('now')),
      FOREIGN KEY (camera_id) REFERENCES camera_configs(id) ON DELETE SET NULL
    )
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  sqlDb.run(`
    CREATE TABLE IF NOT EXISTS zone_cycles (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id          TEXT    NOT NULL UNIQUE,
      zone_id           INTEGER NOT NULL,
      started_at        TEXT    NOT NULL,
      completed_at      TEXT    NULL,
      status            TEXT    NULL CHECK(status IN ('PASS','NR')),
      barcode           TEXT    NULL,
      image_name        TEXT    NULL,
      first_record_id   INTEGER NOT NULL,
      completion_reason TEXT    NULL CHECK(completion_reason IN ('ALL_DEVICES_RECEIVED','TIMEOUT')),
      expected_devices  TEXT    NOT NULL,
      received_devices  TEXT    NOT NULL,
      created_at        TEXT    DEFAULT (datetime('now'))
    )
  `);

  // ── Safe column migrations ─────────────────────────────────────────────────
  addColumnIfNotExists("tcp_messages", "company_id", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfNotExists("tcp_messages", "port", "INTEGER NULL");
  addColumnIfNotExists("tcp_messages", "image", "TEXT NULL");
  addColumnIfNotExists("tcp_messages", "folder_path", "TEXT NULL");
  addColumnIfNotExists("tcp_messages", "barcode", "TEXT NULL");
  addColumnIfNotExists("user_tcp_configs", "folder_path",    "TEXT NULL");
  addColumnIfNotExists("user_tcp_configs", "pair_id",        "INTEGER NOT NULL DEFAULT 0");
  addColumnIfNotExists("user_tcp_configs", "folder_path_ok", "TEXT NULL");
  addColumnIfNotExists("user_tcp_configs", "folder_path_nr", "TEXT NULL");
  addColumnIfNotExists("user_tcp_configs", "zone_id",        "INTEGER NULL");
  addColumnIfNotExists("tcp_messages",     "zone_id",        "INTEGER NULL");
  addColumnIfNotExists("email_logs", "company_id", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfNotExists("email_schedules", "company_id", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfNotExists("email_recipients", "company_id", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfNotExists("system_notifications", "company_id", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfNotExists("smtp_settings", "company_id", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfNotExists("zone_cycles", "image_name",  "TEXT NULL");
  addColumnIfNotExists("zone_cycles", "email_sent",  "INTEGER NOT NULL DEFAULT 0");
  addColumnIfNotExists("zone_cycles", "email_sent_at","TEXT NULL");
  addColumnIfNotExists("zone_cycles", "zone_name",   "TEXT NULL");

  // ── Persist schema changes to disk ────────────────────────────────────────
  await db._persist();

  // ── Seed default data ──────────────────────────────────────────────────────

  // Default company
  let defaultCompanyId;
  const [companies] = await db.query("SELECT id FROM companies LIMIT 1");
  if (!companies.length) {
    await db.execute("INSERT INTO companies (name) VALUES (?)", ["Default Company"]);
    const [[newComp]] = await db.query("SELECT id FROM companies WHERE name = ? LIMIT 1", ["Default Company"]);
    defaultCompanyId = newComp?.id || 1;
    console.log(`Default company seeded with ID: ${defaultCompanyId}`);
  } else {
    defaultCompanyId = companies[0].id;
  }

  // Permissions
  const permList = [
    { code: "VIEW_DASHBOARD", name: "View Dashboard" },
    { code: "VIEW_RECORDS", name: "View Records" },
    { code: "SEND_EMAIL", name: "Send Email" },
    { code: "VIEW_EMAIL_LOGS", name: "View Email Logs" },
    { code: "MANAGE_RECIPIENTS", name: "Manage Recipients" },
    { code: "MANAGE_SCHEDULES", name: "Manage Schedules" },
    { code: "VIEW_NOTIFICATIONS", name: "View Notifications" },
    { code: "MANAGE_SETTINGS", name: "Manage Settings" },
    { code: "CREATE_USERS", name: "Create Users" },
    { code: "EDIT_USERS", name: "Edit Users" },
    { code: "DELETE_USERS", name: "Delete Users" },
    { code: "MANAGE_TCP_CONFIG", name: "Manage TCP Config" },
  ];

  for (const p of permList) {
    await db.execute("INSERT OR IGNORE INTO permissions (code, name) VALUES (?, ?)", [p.code, p.name]);
  }

  // Super Admin user
  const [users] = await db.query("SELECT id FROM users LIMIT 1");
  if (!users.length) {
    const hashedPass = hashPassword("Password123");
    await db.execute(
      "INSERT INTO users (company_id, name, email, password, role, active) VALUES (?, ?, ?, ?, 'Super Admin', 1)",
      [defaultCompanyId, "Super Admin", "superadmin@tcp.com", hashedPass]
    );
    const [[superUser]] = await db.query("SELECT id FROM users WHERE email = ? LIMIT 1", ["superadmin@tcp.com"]);
    const superUserId = superUser?.id;
    console.log(`Default Super Admin seeded (superadmin@tcp.com / Password123) with ID: ${superUserId}`);

    const [allPerms] = await db.query("SELECT id FROM permissions");
    for (const p of allPerms) {
      await db.execute("INSERT OR IGNORE INTO user_permissions (user_id, permission_id) VALUES (?, ?)", [superUserId, p.id]);
    }
    console.log("All permissions assigned to default Super Admin.");
  }

  // ── Seed SMTP from .env if smtp_settings table is empty ───────────────────
  // This ensures the email service works out of the box without manual config.
  // Users can override via the Settings page.
  const [smtpRows] = await db.query("SELECT id FROM smtp_settings LIMIT 1");
  if (!smtpRows.length) {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = Number(process.env.SMTP_PORT) || 587;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const fromName = "ToteTrack";

    if (smtpHost && smtpUser && smtpPass) {
      await db.execute(
        "INSERT INTO smtp_settings (host, port, user, pass, from_name, company_id) VALUES (?, ?, ?, ?, ?, ?)",
        [smtpHost, smtpPort, smtpUser, smtpPass, fromName, defaultCompanyId]
      );
      console.log(`SMTP settings seeded from .env (host=${smtpHost}, user=${smtpUser})`);
    } else {
      console.log("SMTP env vars not set — skipping SMTP seed. Configure via Settings page.");
    }
  }
}

module.exports = initSchema;
