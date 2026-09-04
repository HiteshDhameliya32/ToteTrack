-- SQLite schema reference
-- The actual migration is handled by TCP-Email/src/models/schema.js (initSchema)
-- This file is kept for documentation purposes only.

-- Camera configurations table
CREATE TABLE IF NOT EXISTS camera_configs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_name TEXT    NOT NULL,
  ip_address  TEXT    NOT NULL,
  port        INTEGER NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    DEFAULT (datetime('now')),
  updated_at  TEXT    DEFAULT (datetime('now')),
  UNIQUE(ip_address, port)
);

-- TCP logs table
CREATE TABLE IF NOT EXISTS tcp_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id   INTEGER NULL,
  ip_address  TEXT    NOT NULL,
  port        INTEGER NOT NULL,
  message     TEXT    NOT NULL,
  received_at TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (camera_id) REFERENCES camera_configs(id) ON DELETE SET NULL
);

-- App settings (key-value store)
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
