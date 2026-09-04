/**
 * SQLite database adapter using sql.js (pure JavaScript — no native compilation)
 *
 * MULTI-PROCESS STRATEGY:
 *   Every write reads the latest database buffer from disk, applies the mutation,
 *   captures insertId/affectedRows, exports and writes the buffer back to disk immediately.
 *   Every read reads the latest database buffer from disk.
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env"), override: true });

const path = require("path");
const fs   = require("fs");

const DB_PATH = path.resolve(__dirname, "../../../tcp_logs.db");

// ── WASM module — loaded once per process ──────────────
let _SQL = null;
async function getSQL() {
  if (!_SQL) {
    const initSqlJs = require("sql.js");
    _SQL = await initSqlJs();
  }
  return _SQL;
}

// ── Helper to execute reads fresh from disk ────────────
async function readFromDisk(finalSql, finalParams) {
  const SQL = await getSQL();
  const buf = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  const db  = buf ? new SQL.Database(buf) : new SQL.Database();
  db.run("PRAGMA foreign_keys = ON;");
  try {
    const result = db.exec(finalSql, finalParams);
    if (!result.length) return [];
    const { columns, values } = result[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  } finally {
    db.close();
  }
}

// ── Helper to execute writes fresh from disk & persist ──
async function writeToDisk(finalSql, finalParams) {
  const SQL = await getSQL();
  const buf = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  const db  = buf ? new SQL.Database(buf) : new SQL.Database();
  db.run("PRAGMA foreign_keys = ON;");
  try {
    db.run(finalSql, finalParams);
    const insertId     = db.exec("SELECT last_insert_rowid() AS id")[0]?.values[0][0] ?? 0;
    const affectedRows = db.getRowsModified();
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    return [{ insertId, affectedRows, changedRows: affectedRows }, undefined];
  } finally {
    db.close();
  }
}

// ── Helpers ─────────────────────────────────────────────
function isWriteStatement(sql) {
  return /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)\s/i.test(sql);
}

function flattenParams(sql, params) {
  if (!params || params.length === 0) return { sql, params: [] };
  const flat = [];
  let i = 0;
  const newSql = sql.replace(/\?/g, () => {
    const p = params[i++];
    if (Array.isArray(p)) { p.forEach(v => flat.push(v)); return p.map(() => "?").join(","); }
    flat.push(p ?? null);
    return "?";
  });
  return { sql: newSql, params: flat };
}

// ── Core runner ─────────────────────────────────────────
async function run(sql, params = []) {
  const { sql: finalSql, params: finalParams } = flattenParams(sql, params);

  if (isWriteStatement(finalSql)) {
    return writeToDisk(finalSql, finalParams);
  } else {
    const rows = await readFromDisk(finalSql, finalParams);
    return [rows, undefined];
  }
}

// ── Schema init helpers (for schema.js migrations) ──────
let _schemaDb = null;
async function getSchemaDb() {
  const SQL = await getSQL();
  const buf = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  _schemaDb = buf ? new SQL.Database(buf) : new SQL.Database();
  _schemaDb.run("PRAGMA foreign_keys = ON;");
  return _schemaDb;
}

async function persistSchema() {
  if (_schemaDb) {
    fs.writeFileSync(DB_PATH, Buffer.from(_schemaDb.export()));
    _schemaDb.close();
    _schemaDb = null;
  }
}

// ── Public API ──────────────────────────────────────────
module.exports = {
  execute: (sql, params) => run(sql, params),
  query:   (sql, params) => run(sql, params),
  _getDb:   getSchemaDb,
  _persist: persistSchema,
};
