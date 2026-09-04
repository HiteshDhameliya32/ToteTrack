/**
 * Migration endpoint — upgrades any older database to the current schema.
 *
 * GET  /api/migrate?key=<MIGRATE_API_KEY>
 * POST /api/migrate  (body or header: key)
 *
 * Safe to run multiple times — every operation is idempotent:
 *   CREATE TABLE IF NOT EXISTS
 *   ALTER TABLE … ADD COLUMN (only if column missing)
 *   INSERT OR IGNORE (seed data)
 *
 * Security: key is read from MIGRATE_API_KEY env var.
 *           Default: "tcp_migrate_secret"
 */

const router     = require("express").Router();
const db         = require("../../TCP-Email/src/config/db");
const initSchema = require("../../TCP-Email/src/models/schema");

const MIGRATE_KEY = process.env.MIGRATE_API_KEY || "tcp_migrate_secret";

function resolveKey(req) {
  return req.query.key
    || req.headers["x-migrate-key"]
    || req.body?.key
    || null;
}

function requireMigrateKey(req, res, next) {
  const key = resolveKey(req);
  if (!key || key !== MIGRATE_KEY) {
    return res.status(401).json({
      success: false,
      error:   "Missing or invalid migration key.",
      hint:    "Add ?key=<MIGRATE_API_KEY> to the URL, or set X-Migrate-Key header.",
    });
  }
  next();
}

/* ── Snapshot table names + column lists before migration ─────────────────── */
async function snapshotSchema() {
  const sqlDb = await db._getDb();
  const snapshot = {};
  const tables = sqlDb.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  if (!tables.length) return snapshot;
  for (const name of tables[0].values.map(r => r[0])) {
    const info = sqlDb.exec(`PRAGMA table_info(${name})`);
    snapshot[name] = info.length ? info[0].values.map(r => r[1]) : [];
  }
  return snapshot;
}

/* ── Diff two snapshots → human-readable changes ──────────────────────────── */
function diffSnapshots(before, after) {
  const changes = [];

  // New tables
  for (const table of Object.keys(after)) {
    if (!before[table]) {
      changes.push({ type: "NEW_TABLE", table, detail: `Created table "${table}"` });
    }
  }

  // New columns in existing tables
  for (const table of Object.keys(after)) {
    if (!before[table]) continue; // already reported as new table
    const newCols = after[table].filter(c => !before[table].includes(c));
    for (const col of newCols) {
      changes.push({ type: "NEW_COLUMN", table, column: col, detail: `Added column "${col}" to "${table}"` });
    }
  }

  return changes;
}

/* ── Migration handler ─────────────────────────────────────────────────────── */
async function handleMigrate(req, res) {
  const started = Date.now();

  try {
    const before = await snapshotSchema();
    await initSchema();
    const after   = await snapshotSchema();
    const changes = diffSnapshots(before, after);
    const elapsed = Date.now() - started;

    const newTables  = changes.filter(c => c.type === "NEW_TABLE").map(c => c.table);
    const newColumns = changes.filter(c => c.type === "NEW_COLUMN").map(c => `${c.table}.${c.column}`);

    return res.status(200).json({
      success:      true,
      message:      changes.length
        ? `Migration complete — ${changes.length} change(s) applied.`
        : "Database is already up to date. No changes needed.",
      elapsed_ms:   elapsed,
      changes_count: changes.length,
      new_tables:   newTables,
      new_columns:  newColumns,
      changes:      changes.map(c => c.detail),
      credentials: {
        note:     "Default Super Admin (only set if no users exist)",
        email:    "superadmin@tcp.com",
        password: "Password123",
      },
    });
  } catch (err) {
    const elapsed = Date.now() - started;
    console.error("[migrate] Error:", err);

    return res.status(500).json({
      success:    false,
      message:    "Migration failed.",
      error:      err.message,
      elapsed_ms: elapsed,
    });
  }
}

router.get("/migrate",  requireMigrateKey, handleMigrate);
router.post("/migrate", requireMigrateKey, handleMigrate);

module.exports = router;
