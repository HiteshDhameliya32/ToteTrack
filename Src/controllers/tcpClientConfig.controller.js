const db     = require("../config/db");
const client = require("../client/client");

// ── Ensure all tables exist (idempotent) ─────────────────────────────────────
async function ensureTable() {
  // Core user tcp config table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_tcp_configs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL,
      host           TEXT    NOT NULL,
      port           INTEGER NOT NULL,
      folder_path_ok TEXT    NULL,
      folder_path_nr TEXT    NULL,
      zone_id        INTEGER NULL,
      pair_id        INTEGER NOT NULL DEFAULT 0,
      is_active      INTEGER NOT NULL DEFAULT 1,
      created_at     TEXT    DEFAULT (datetime('now')),
      UNIQUE(user_id, host, port)
    )
  `);

  // Safe migrations — add columns if missing (for existing DBs)
  for (const [col, def] of [
    ["folder_path_ok", "TEXT NULL"],
    ["folder_path_nr", "TEXT NULL"],
    ["zone_id",        "INTEGER NULL"],
    ["pair_id",        "INTEGER NOT NULL DEFAULT 0"],
    ["folder_path",    "TEXT NULL"],   // legacy, keep for compat
  ]) {
    try { await db.execute(`SELECT ${col} FROM user_tcp_configs LIMIT 1`); }
    catch { await db.execute(`ALTER TABLE user_tcp_configs ADD COLUMN ${col} ${def}`); }
  }

  // Zone tables
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tcp_zones (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      name       TEXT    NOT NULL,
      created_at TEXT    DEFAULT (datetime('now'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS tcp_zone_ports (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_id INTEGER NOT NULL,
      host    TEXT    NOT NULL,
      port    INTEGER NOT NULL,
      UNIQUE(zone_id, host, port)
    )
  `);

  // tcp_messages zone_id column migration
  try { await db.execute("SELECT zone_id FROM tcp_messages LIMIT 1"); }
  catch { await db.execute("ALTER TABLE tcp_messages ADD COLUMN zone_id INTEGER NULL"); }
}

// ── GET /api/tcp-client-config ────────────────────────────────────────────────
async function getConfig(req, res) {
  try {
    await ensureTable();
    const userId = req.user.id;
    const [rows] = await db.execute(
      "SELECT id, host, port, folder_path_ok, folder_path_nr, zone_id, is_active FROM user_tcp_configs WHERE user_id = ? ORDER BY id",
      [userId]
    );
    const configured = rows.some(r => r.is_active);
    res.json({ configured, entries: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── PUT /api/tcp-client-config ────────────────────────────────────────────────
// Body: { configs: [{ host, port, folder_path_ok?, folder_path_nr? }] }
async function updateConfig(req, res) {
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const configs  = req.body.configs;

  if (!Array.isArray(configs) || configs.length === 0)
    return res.status(400).json({ error: "configs[] array with at least one entry is required" });

  for (const cfg of configs) {
    const host = (cfg.host || "").toString().trim();
    if (!host)                      return res.status(400).json({ error: "host is required" });
    if (!ipRegex.test(host))        return res.status(400).json({ error: `Invalid IP: ${cfg.host}` });
    const p = Number(cfg.port);
    if (!cfg.port || !Number.isInteger(p) || p < 1 || p > 65535)
      return res.status(400).json({ error: `Invalid port: ${cfg.port}` });
  }

  try {
    await ensureTable();
    const userId = req.user.id;

    // Cross-user duplicate check
    for (const cfg of configs) {
      const host = cfg.host.trim();
      const port = Number(cfg.port);
      const [existing] = await db.execute(
        "SELECT user_id FROM user_tcp_configs WHERE host = ? AND port = ? AND user_id != ?",
        [host, port, userId]
      );
      if (existing.length > 0)
        return res.status(409).json({ error: `Port ${port} on ${host} is already registered by another user.` });
    }

    client.disconnectAllForUser(userId);

    // ── Resolve zone_id for each config row ────────────────────────────────
    // We read the current zone_port assignments so we don't lose them when re-saving.
    // The client sends zone_id as part of each cfg (set by the zone UI), so we honour it.

    // Delete old config rows
    await db.execute("DELETE FROM user_tcp_configs WHERE user_id = ?", [userId]);

    // Insert new rows — one row per IP:Port
    for (const cfg of configs) {
      const host        = cfg.host.trim();
      const port        = Number(cfg.port);
      // Remove surrounding quotes (common when pasting from Windows "Copy as path")
      const folder_ok   = cfg.folder_path_ok?.trim().replace(/^["']|["']$/g, '') || null;
      const folder_nr   = cfg.folder_path_nr?.trim().replace(/^["']|["']$/g, '') || null;
      const zone_id     = cfg.zone_id || null;

      await db.execute(
        `INSERT INTO user_tcp_configs
           (user_id, host, port, folder_path_ok, folder_path_nr, zone_id, pair_id, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1)`,
        [userId, host, port, folder_ok, folder_nr, zone_id]
      );
    }

    // Rebuild tcp_zone_ports from the configs that carry a zone_id
    const zoneIds = [...new Set(configs.filter(c => c.zone_id).map(c => c.zone_id))];
    for (const zid of zoneIds) {
      await db.execute("DELETE FROM tcp_zone_ports WHERE zone_id = ?", [zid]);
      for (const cfg of configs.filter(c => c.zone_id === zid)) {
        await db.execute(
          "INSERT OR IGNORE INTO tcp_zone_ports (zone_id, host, port) VALUES (?, ?, ?)",
          [zid, cfg.host.trim(), Number(cfg.port)]
        );
      }
    }

    // Rebuild user label sequence
    await client.refreshUserLabels();

    // Reconnect
    for (const cfg of configs) {
      client.connectOne(userId, cfg.host.trim(), Number(cfg.port));
    }

    const [rows] = await db.execute(
      "SELECT id, host, port, folder_path_ok, folder_path_nr, zone_id, is_active FROM user_tcp_configs WHERE user_id = ? ORDER BY id",
      [userId]
    );
    res.json({ success: true, entries: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/tcp-client-config/disconnect ────────────────────────────────────
async function disconnect(req, res) {
  try {
    const userId = req.user.id;
    await db.execute("UPDATE user_tcp_configs SET is_active = 0 WHERE user_id = ?", [userId]);
    client.logoutUser(userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/tcp-client-config/reconnect ─────────────────────────────────────
async function reconnect(req, res) {
  try {
    const userId = req.user.id;
    await db.execute("UPDATE user_tcp_configs SET is_active = 1 WHERE user_id = ?", [userId]);
    const rows = await client.loadAndConnectUser(userId);
    res.json({ success: true, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── GET /api/tcp-zones ────────────────────────────────────────────────────────
async function getZones(req, res) {
  try {
    await ensureTable();
    const userId = req.user.id;
    const [zones] = await db.execute(
      "SELECT id, name, created_at FROM tcp_zones WHERE user_id = ? ORDER BY id",
      [userId]
    );
    for (const z of zones) {
      const [ports] = await db.execute(
        "SELECT host, port FROM tcp_zone_ports WHERE zone_id = ? ORDER BY id",
        [z.id]
      );
      z.ports = ports;
    }
    res.json(zones);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── POST /api/tcp-zones ───────────────────────────────────────────────────────
// Body: { name?, ports: [{ host, port }] }
async function createZone(req, res) {
  try {
    await ensureTable();
    const userId = req.user.id;
    const { ports } = req.body;

    if (!Array.isArray(ports) || ports.length === 0)
      return res.status(400).json({ error: "ports[] array is required" });

    // Auto-name: Zone N
    const [existing] = await db.execute("SELECT COUNT(*) AS cnt FROM tcp_zones WHERE user_id = ?", [userId]);
    const nextNum    = (existing[0]?.cnt ?? 0) + 1;
    const name       = req.body.name?.trim() || `Zone ${nextNum}`;

    const [result] = await db.execute(
      "INSERT INTO tcp_zones (user_id, name) VALUES (?, ?)",
      [userId, name]
    );
    let zoneId = result?.insertId;
    if (!zoneId) {
      const [latest] = await db.query(
        "SELECT id FROM tcp_zones WHERE user_id = ? ORDER BY id DESC LIMIT 1",
        [userId]
      );
      zoneId = latest[0]?.id;
    }

    for (const p of ports) {
      await db.execute(
        "INSERT OR IGNORE INTO tcp_zone_ports (zone_id, host, port) VALUES (?, ?, ?)",
        [zoneId, p.host, Number(p.port)]
      );
      // Tag the config row with this zone_id
      await db.execute(
        "UPDATE user_tcp_configs SET zone_id = ? WHERE user_id = ? AND host = ? AND port = ?",
        [zoneId, userId, p.host, Number(p.port)]
      );
    }

    // Return the newly created zone with its ports
    const [portRows] = await db.execute(
      "SELECT host, port FROM tcp_zone_ports WHERE zone_id = ?",
      [zoneId]
    );
    res.json({ success: true, zone: { id: zoneId, name, ports: portRows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── DELETE /api/tcp-zones/:id ─────────────────────────────────────────────────
async function deleteZone(req, res) {
  try {
    await ensureTable();
    const userId = req.user.id;
    const zoneId = Number(req.params.id);

    // Verify ownership
    const [zones] = await db.execute("SELECT id FROM tcp_zones WHERE id = ? AND user_id = ?", [zoneId, userId]);
    if (!zones.length) return res.status(404).json({ error: "Zone not found" });

    // Untag configs
    await db.execute("UPDATE user_tcp_configs SET zone_id = NULL WHERE user_id = ? AND zone_id = ?", [userId, zoneId]);
    // Cascade deletes tcp_zone_ports via trigger or we do it manually
    await db.execute("DELETE FROM tcp_zone_ports WHERE zone_id = ?", [zoneId]);
    await db.execute("DELETE FROM tcp_zones WHERE id = ?", [zoneId]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getConfig, updateConfig, disconnect, reconnect, getZones, createZone, deleteZone };
