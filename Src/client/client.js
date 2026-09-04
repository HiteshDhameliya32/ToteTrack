const net    = require("net");
const path   = require("path");
const fs     = require("fs");
const db     = require("../config/db");
const logger = require("../services/logger");
const { insertNotification } = require(path.resolve(__dirname, "../../TCP-Email/src/utils/notifyDB"));
const zoneCycleProcessor = require("../services/zoneCycleProcessor.service");

const RECONNECT_DELAY = Number(process.env.RECONNECT_DELAY || 5000);
const INITIAL_MESSAGE = process.env.INITIAL_MESSAGE || "";

// key: "userId:host:port" -> { socket, timer }
const connections    = new Map();
// users who have explicitly logged out — suppress reconnect
const loggedOut      = new Set();

// ── 30ms Matching Setup ─────────────────────────────────────────────────────
// key: "userId:host:port" -> { text, port, timer, timestamp }
const MATCHING_WINDOW  = Number(process.env.TCP_MATCHING_WINDOW || 30);
// key: "userId:host:port" → { text, ts, timer }
const rawMessages = new Map();

function connKey(userId, host, port) {
  return `${userId}:${host}:${port}`;
}

function getKolkataTimeStr(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type) => parts.find(p => p.type === type).value;
  return `${getPart("year")}-${getPart("month")}-${getPart("day")} ${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;
}

let userLabels = new Map();

async function refreshUserLabels() {
  try {
    const [rows] = await db.execute("SELECT host, port FROM user_tcp_configs ORDER BY id");
    const newLabels = new Map();
    let index = 1;
    for (const r of rows) {
      const k = `${r.host}:${r.port}`;
      if (!newLabels.has(k)) {
        newLabels.set(k, `user${index}`);
        index++;
      }
    }
    userLabels = newLabels;
  } catch (e) {
    logger.error(`Error refreshing user labels: ${e.message}`);
  }
}

function notify(severity, title, message) {
  insertNotification({ service_name: "TCP Node", severity, title, message, company_id: 1 }).catch(() => {});
}

async function findMatchingImage(folderPath, identifier) {
  if (!folderPath || !identifier) return null;
  const cleanFolder = folderPath.trim().replace(/^["']|["']$/g, '');
  const rawIdent    = identifier.trim();
  const identName   = path.parse(rawIdent).name.toLowerCase();

  try {
    if (!fs.existsSync(cleanFolder)) {
      logger.warn(`[image-search] Folder does not exist: ${cleanFolder}`);
      return null;
    }
    const files = fs.readdirSync(cleanFolder);
    // 1. Check exact name match (case-insensitive)
    // 2. Check full filename match (case-insensitive, in case message includes .jpg)
    const match = files.find(f => {
      const fName = path.parse(f).name.toLowerCase();
      const fFullName = f.toLowerCase();
      return fName === identName || fFullName === rawIdent.toLowerCase();
    });
    return match || null;
  } catch (e) {
    logger.warn(`[image-search] Cannot read folder ${cleanFolder}: ${e.message}`);
    return null;
  }
}

// ── saveOne ──────────────────────────────────────────────────────────────────
// Look up config for one host:port, find a matching image, and insert one record.
async function saveOne(userId, host, port, text, barcode, identifier) {
  const [[config]] = await db.execute(
    "SELECT folder_path_ok, folder_path_nr, zone_id FROM user_tcp_configs WHERE user_id = ? AND host = ? AND port = ? LIMIT 1",
    [userId, host, Number(port)]
  );

  const folderPath = barcode
    ? (config?.folder_path_ok || null)   // barcode → OK folder
    : (config?.folder_path_nr || null);  // NR / no barcode → NR folder
  const zoneId     = config?.zone_id || null;

  const userLabel    = userLabels.get(`${host}:${port}`) || `user${userId}`;
  const matchedImage = await findMatchingImage(folderPath, identifier);

  if (matchedImage)
    logger.info(`[${userLabel}][${port}] Image matched: ${matchedImage} in ${folderPath}`);
  else if (folderPath)
    logger.info(`[${userLabel}][${port}] No image match for "${identifier}" in ${folderPath}`);

  console.log(`🗂️  [${userLabel}][${port}] folder=${folderPath} | matched=${matchedImage} | barcode=${barcode} | zone=${zoneId}`);

  const result = await db.execute(
    `INSERT INTO tcp_messages
       (message, company_id, port, image, folder_path, barcode, zone_id, received_at)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?)`,
    [text, Number(port), matchedImage, folderPath, barcode, zoneId, getKolkataTimeStr()]
  );
  
  // Get the inserted record ID (db.execute returns [{insertId, affectedRows}, undefined])
  const recordId = result[0]?.insertId;
  
  logger.info(`[${userLabel}][${port}] Saved → recordId=${recordId} image=${matchedImage} barcode=${barcode} zone=${zoneId}`);
  
  // ── Process for zone cycle tracking (non-blocking) ────────────────────────
  if (zoneId && recordId) {
    zoneCycleProcessor.processRecord({
      recordId,
      host,
      port: Number(port),
      zoneId,
      barcode,
      message: text
    }).catch(err => {
      logger.error(`[${userLabel}][${port}] Zone cycle processing error: ${err.message}`);
    });
  }
}

// ── processMessage ──────────────────────────────────────────────────────────
// Paired mode rules:
//   • Both have barcode → save BOTH records (one per port)
//   • One barcode, one NR → save only the barcode record
//   • Both NR → save only one record (port1 side)
// Unpaired mode: save one record, barcode if present else null.
async function processMessage(userId, host1, port1, text1, host2, port2, text2) {
  try {
    const parsePart = (msg) => {
      const idx   = msg.indexOf("|");
      const ident = idx === -1 ? msg : msg.substring(0, idx);
      const val   = idx === -1 ? null : msg.substring(idx + 1);
      return { ident, val };
    };

    const p1 = parsePart(text1);

    if (text2 !== undefined) {
      // ── Paired mode ─────────────────────────────────────────────────────
      const p2          = parsePart(text2);
      const isP1Barcode = !!(p1.val && p1.val !== "NR");
      const isP2Barcode = !!(p2.val && p2.val !== "NR");

      if (isP1Barcode && isP2Barcode) {
        // Both ports have a barcode → save BOTH records
        await saveOne(userId, host1, port1, text1, p1.val, p1.ident);
        await saveOne(userId, host2, port2, text2, p2.val, p2.ident);
      } else if (isP2Barcode) {
        // Only port2 has barcode → save port2 only
        await saveOne(userId, host2, port2, text2, p2.val, p2.ident);
      } else if (isP1Barcode) {
        // Only port1 has barcode → save port1 only
        await saveOne(userId, host1, port1, text1, p1.val, p1.ident);
      } else {
        // Both NR / empty → save one record (port1 side)
        await saveOne(userId, host1, port1, text1, null, p1.ident);
      }
    } else {
      // ── Unpaired mode ────────────────────────────────────────────────────
      const barcode = (p1.val && p1.val !== "NR") ? p1.val : null;
      await saveOne(userId, host1, port1, text1, barcode, p1.ident);
    }
  } catch (e) {
    const userLabel = userLabels.get(`${host1}:${port1}`) || `user${userId}`;
    logger.error(`[${userLabel}][${port1}] DB ERROR in processMessage: ${e.message}`);
  }
}

// ── connectOne ───────────────────────────────────────────────────────────────
function connectOne(userId, host, port) {
  if (loggedOut.has(userId)) return;
  const key = connKey(userId, host, port);
  if (connections.has(key)) return;

  const socket = new net.Socket();
  let isConnected = false;
  connections.set(key, { socket, timer: null, connected: false });

  const userLabel = userLabels.get(`${host}:${port}`) || `user${userId}`;

  logger.info(`[${userLabel}] CONNECTING ${host}:${port}`);
  console.log(`🔄 [${userLabel}] Connecting ${host}:${port}`);

  socket.connect(Number(port), host, () => {
    isConnected = true;
    // Mark as connected in the map so getConnectionStatus() can read it
    const cur = connections.get(key);
    if (cur) connections.set(key, { ...cur, connected: true });
    logger.info(`[${userLabel}] CONNECTED ${host}:${port}`);
    console.log(`✅ [${userLabel}] Connected ${host}:${port}`);
    notify("info", "TCP Connected", `User ${userLabel} connected to ${host}:${port}`);
    if (INITIAL_MESSAGE) socket.write(INITIAL_MESSAGE + "\r\n");
  });

  socket.on("data", async (data) => {
    if (!isConnected) return;
    const text = data.toString().trim();
    if (!text) return;
    logger.info(`[${userLabel}][${host}:${port}] ${text}`);
    console.log(`📩 [${userLabel}][${port}]`, text);

    // ── Store arrival IMMEDIATELY (before any await) ─────────────────────
    // This is the fix for the async race condition: both ports' messages
    // must be in rawMessages before either DB query resolves, so partner
    // lookup always succeeds within the matching window.
    const myKey     = connKey(userId, host, port);
    const arrivalTs = Date.now();
    rawMessages.set(myKey, { text, ts: arrivalTs, timer: null });

    try {
      // ── Zone-based pair matching ──────────────────────────────────────
      const [[myRow]] = await db.execute(
        "SELECT zone_id, is_active FROM user_tcp_configs WHERE user_id = ? AND host = ? AND port = ? LIMIT 1",
        [userId, host, Number(port)]
      );

      if (!myRow || !myRow.is_active) {
        rawMessages.delete(myKey);
        await processMessage(userId, host, Number(port), text);
        return;
      }

      const zoneId = myRow.zone_id;

      if (!zoneId) {
        rawMessages.delete(myKey);
        await processMessage(userId, host, Number(port), text);
        return;
      }

      // Find the OTHER port(s) in the same Zone
      const [pairRows] = await db.execute(
        "SELECT host, port FROM user_tcp_configs WHERE user_id = ? AND zone_id = ? AND (host != ? OR port != ?) AND is_active = 1",
        [userId, zoneId, host, Number(port)]
      );

      if (pairRows.length !== 1) {
        // 0 or 2+ partners — process immediately without pairing
        rawMessages.delete(myKey);
        await processMessage(userId, host, Number(port), text);
        return;
      }

      const currentPort = Number(port);
      const otherHost   = pairRows[0].host;
      const otherPort   = Number(pairRows[0].port);
      const otherKey    = connKey(userId, otherHost, otherPort);

      // Guard: if my entry was already consumed by partner's handler, skip
      if (!rawMessages.has(myKey)) return;

      const partnerMsg = rawMessages.get(otherKey);

      if (partnerMsg) {
        // ── Partner message found — check timing ─────────────────────
        const delta = Math.abs(arrivalTs - partnerMsg.ts);

        // Cancel partner's timeout (it must not process unpaired now)
        if (partnerMsg.timer) clearTimeout(partnerMsg.timer);
        rawMessages.delete(otherKey);
        rawMessages.delete(myKey);

        if (delta <= MATCHING_WINDOW) {
          // ✅ Both arrived within window — PAIR
          logger.info(`[${userLabel}] PAIRED ${host}:${currentPort} & ${otherHost}:${otherPort} (zone=${zoneId}) Δ${delta}ms`);
          await processMessage(userId, host, currentPort, text, otherHost, otherPort, partnerMsg.text);
        } else {
          // Partner's message is stale (> window) — process both unpaired
          logger.info(`[${userLabel}] Stale partner (Δ${delta}ms > ${MATCHING_WINDOW}ms) — processing both unpaired`);
          await processMessage(userId, otherHost, otherPort, partnerMsg.text);
          await processMessage(userId, host, currentPort, text);
        }
      } else {
        // ── No partner yet — set a timeout for remaining window ───────
        const elapsed   = Date.now() - arrivalTs;
        const remaining = Math.max(0, MATCHING_WINDOW - elapsed);

        const timer = setTimeout(async () => {
          if (rawMessages.has(myKey)) {
            rawMessages.delete(myKey);
            logger.info(`[${userLabel}][${currentPort}] Matching window expired → processing unpaired`);
            await processMessage(userId, host, currentPort, text);
          }
        }, remaining);

        // Update entry with timer so partner can cancel it
        rawMessages.set(myKey, { text, ts: arrivalTs, timer });
      }
    } catch (e) {
      rawMessages.delete(myKey);
      logger.error(`[${userLabel}][${port}] Pairing logic error: ${e.message}`);
    }
  });

  socket.on("end", () => {
    logger.info(`[${userLabel}][${host}:${port}] server ended connection`);
  });

  socket.on("close", () => {
    isConnected = false;
    // Mark as disconnected in the map immediately
    const cur = connections.get(key);
    if (cur) connections.set(key, { ...cur, connected: false });
    logger.info(`[${userLabel}][${host}:${port}] closed — retrying in ${RECONNECT_DELAY}ms`);
    console.log(`❌ [${userLabel}][${port}] disconnected`);
    socket.removeAllListeners();
    socket.destroy();

    if (loggedOut.has(userId) || !connections.has(key)) return;
    notify("warning", "TCP Closed", `${host}:${port} closed for user ${userLabel}`);

    db.execute(
      "SELECT is_active FROM user_tcp_configs WHERE user_id = ? AND host = ? AND port = ? LIMIT 1",
      [userId, host, Number(port)]
    ).then(([[cfg]]) => {
      if (!cfg || !cfg.is_active || loggedOut.has(userId) || !connections.has(key)) {
        connections.delete(key);
        console.log(`🔒 [${userLabel}][${port}] is_active=0 or logged out — reconnect suppressed`);
        return;
      }
      const timer = setTimeout(() => {
        connections.delete(key);
        connectOne(userId, host, port);
      }, RECONNECT_DELAY);
      connections.set(key, { socket: null, timer });
    }).catch(() => { connections.delete(key); });
  });

  socket.on("error", (err) => {
    logger.error(`[${userLabel}][${host}:${port}] ERROR: ${err.message}`);
    console.log(`🚨 [${userLabel}][${port}] ERROR:`, err.message);
  });
}

function disconnectUser(userId, host, port) {
  const key   = connKey(userId, host, port);
  const entry = connections.get(key);
  if (!entry) return;
  if (entry.timer)  clearTimeout(entry.timer);
  if (entry.socket) { entry.socket.removeAllListeners(); entry.socket.destroy(); }
  connections.delete(key);
  const userLabel = userLabels.get(`${host}:${port}`) || `user${userId}`;
  logger.info(`[${userLabel}] Disconnected ${host}:${port}`);
}

function disconnectAllForUser(userId) {
  loggedOut.delete(userId);
  for (const key of connections.keys()) {
    if (key.startsWith(`${userId}:`)) {
      const entry = connections.get(key);
      if (entry.timer)  clearTimeout(entry.timer);
      connections.delete(key);
      if (entry.socket) { entry.socket.removeAllListeners(); entry.socket.destroy(); }
    }
  }
  // Cancel any pending raw messages for this user
  for (const [k, v] of rawMessages.entries()) {
    if (k.startsWith(`${userId}:`)) {
      if (v.timer) clearTimeout(v.timer);
      rawMessages.delete(k);
    }
  }
}

function logoutUser(userId) {
  loggedOut.add(userId);
  for (const key of [...connections.keys()]) {
    if (key.startsWith(`${userId}:`)) {
      const entry = connections.get(key);
      if (entry.timer)  clearTimeout(entry.timer);
      connections.delete(key);
      if (entry.socket) { entry.socket.removeAllListeners(); entry.socket.destroy(); }
    }
  }
  // Cancel any pending raw messages for this user
  for (const [k, v] of [...rawMessages.entries()]) {
    if (k.startsWith(`${userId}:`)) {
      if (v.timer) clearTimeout(v.timer);
      rawMessages.delete(k);
    }
  }
  const userLabel = `user${userId}`;
  logger.info(`[${userLabel}] logged out — all TCP connections stopped`);
  console.log(`🔒 [${userLabel}] logged out — TCP connections stopped`);
}

async function loadAndConnectUser(userId) {
  loggedOut.delete(userId);
  try {
    await refreshUserLabels();
    const [rows] = await db.execute(
      "SELECT host, port FROM user_tcp_configs WHERE user_id = ? AND is_active = 1",
      [userId]
    );
    rows.forEach(({ host, port }) => connectOne(userId, host, port));
    return rows;
  } catch (e) {
    logger.error(`Failed to load TCP config for user ${userId}: ${e.message}`);
    return [];
  }
}

async function loadAll() {
  try {
    await refreshUserLabels();
    const [rows] = await db.execute(
      "SELECT DISTINCT user_id, host, port FROM user_tcp_configs WHERE is_active = 1"
    );
    rows.forEach(({ user_id, host, port }) => connectOne(user_id, host, port));
    logger.info(`TCP client: loaded ${rows.length} connection(s) from DB`);
  } catch (e) {
    logger.error(`TCP client loadAll error: ${e.message}`);
  }
}

function stopAll() {
  for (const [, entry] of connections.entries()) {
    if (entry.timer)  clearTimeout(entry.timer);
    if (entry.socket) { entry.socket.removeAllListeners(); entry.socket.destroy(); }
  }
  connections.clear();
}

module.exports = {
  connectOne,
  disconnectUser,
  disconnectAllForUser,
  logoutUser,
  loadAndConnectUser,
  loadAll,
  stopAll,
  refreshUserLabels,
  getConnectionStatus,
  getConnectionsDump,
};

/**
 * Debug helper — returns raw connections map state for /devices/debug
 */
function getConnectionsDump() {
  const result = {};
  for (const [key, entry] of connections.entries()) {
    result[key] = {
      connected:        entry.connected,
      hasSocket:        !!entry.socket,
      socketDestroyed:  entry.socket ? entry.socket.destroyed : null,
      hasTimer:         !!entry.timer,
    };
  }
  return result;
}

/**
 * Returns live status of every configured device.
 * Joins against user_tcp_configs to include zone name and device label.
 * connected = true means the socket is currently open in the connections Map.
 */
async function getConnectionStatus() {
  const [rows] = await db.execute(
    `SELECT uc.id, uc.host, uc.port, uc.zone_id, uc.user_id,
            COALESCE(tz.name, 'Zone ' || uc.zone_id) AS zone_name
     FROM user_tcp_configs uc
     LEFT JOIN tcp_zones tz ON tz.id = uc.zone_id
     WHERE uc.is_active = 1
     ORDER BY uc.zone_id ASC, uc.id ASC`
  );

  return rows.map(r => {
    const key   = connKey(r.user_id, r.host, r.port);
    const entry = connections.get(key);
    const connected = entry
      ? (entry.connected === true || (!!(entry.socket && !entry.socket.destroyed && entry.connected !== false)))
      : false;
    return {
      id:        r.id,
      host:      r.host,
      port:      r.port,
      zone_id:   r.zone_id,
      zone_name: r.zone_name || `Zone ${r.zone_id}`,
      label:     userLabels.get(`${r.host}:${r.port}`) || `${r.host}:${r.port}`,
      connected,
    };
  });
}
