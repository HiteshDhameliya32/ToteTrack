require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env"), override: true });

const cron   = require("node-cron");
const fs     = require("fs");
const path   = require("path");
const db     = require("../config/db");
const logger = require("../services/logger");

const RETENTION_DAYS = Number(process.env.DATA_RETENTION_DAYS ?? 7);
const ENABLE         = process.env.ENABLE_AUTO_CLEANUP === "true";
const CLEANUP_TIME   = process.env.CLEANUP_TIME || "02:00";

/* ─── Cutoff date string (IST) ─────────────────────────── */
function getCutoffDate() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  now.setDate(now.getDate() - RETENTION_DAYS);
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/* ─── Delete old DB rows ───────────────────────────────── */
async function cleanDatabase(cutoff) {
  // 1. zone_cycles (primary data store)
  const [cycleResult] = await db.execute(
    "DELETE FROM zone_cycles WHERE date(started_at) < ?",
    [cutoff]
  );
  logger.info(`[cleanup] zone_cycles deleted: ${cycleResult.affectedRows} rows (before ${cutoff})`);

  // 2. tcp_messages (raw audit trail)
  const [msgResult] = await db.execute(
    "DELETE FROM tcp_messages WHERE date(received_at) < ?",
    [cutoff]
  );
  logger.info(`[cleanup] tcp_messages deleted: ${msgResult.affectedRows} rows (before ${cutoff})`);

  return {
    cycles:   cycleResult.affectedRows,
    messages: msgResult.affectedRows,
  };
}

/* ─── Delete old images from a folder ─────────────────── */
function cleanFolder(folderRaw, cutoffMs, label) {
  if (!folderRaw) return 0;
  const folder = folderRaw.trim().replace(/^["']|["']$/g, "");
  if (!fs.existsSync(folder)) {
    logger.warn(`[cleanup] Folder not found, skipping: ${folder}`);
    return 0;
  }

  let deleted = 0;
  let skipped = 0;

  try {
    const files = fs.readdirSync(folder);
    for (const file of files) {
      const filePath = path.join(folder, file);
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) continue;
        if (stat.mtimeMs < cutoffMs) {
          fs.unlinkSync(filePath);
          deleted++;
          logger.info(`[cleanup] Deleted image: ${filePath}`);
        } else {
          skipped++;
        }
      } catch (fileErr) {
        logger.warn(`[cleanup] Could not process file ${filePath}: ${fileErr.message}`);
      }
    }
    logger.info(`[cleanup] ${label} → deleted: ${deleted}, kept: ${skipped}`);
  } catch (err) {
    logger.error(`[cleanup] Failed to read folder ${folder}: ${err.message}`);
  }

  return deleted;
}

/* ─── Get all image folders from DB ───────────────────── */
async function getImageFolders() {
  const [rows] = await db.execute(
    `SELECT DISTINCT folder_path_ok, folder_path_nr
     FROM user_tcp_configs
     WHERE is_active = 1 AND (folder_path_ok IS NOT NULL OR folder_path_nr IS NOT NULL)`
  );
  const folders = new Set();
  for (const r of rows) {
    if (r.folder_path_ok) folders.add({ path: r.folder_path_ok, label: "OK folder" });
    if (r.folder_path_nr) folders.add({ path: r.folder_path_nr, label: "NR folder" });
  }
  return [...folders];
}

/* ─── Main cleanup ─────────────────────────────────────── */
async function runCleanup() {
  if (!ENABLE) {
    logger.warn("[cleanup] Auto cleanup is DISABLED — skipping.");
    return;
  }

  const cutoff   = getCutoffDate();
  // cutoffMs: files modified before this timestamp will be deleted
  const cutoffMs = new Date(cutoff + "T00:00:00+05:30").getTime();

  logger.info(`[cleanup] ─── Starting cleanup ───────────────────────────`);
  logger.info(`[cleanup] Retention: ${RETENTION_DAYS} days | Cutoff: ${cutoff}`);

  const stats = { cycles: 0, messages: 0, images: 0 };

  // 1. Database rows
  try {
    const dbStats = await cleanDatabase(cutoff);
    stats.cycles   = dbStats.cycles;
    stats.messages = dbStats.messages;
  } catch (err) {
    logger.error(`[cleanup] Database cleanup failed: ${err.message}`);
  }

  // 2. Image files
  try {
    const folders = await getImageFolders();
    if (folders.length === 0) {
      logger.info("[cleanup] No image folders configured — skipping image cleanup.");
    }
    for (const { path: folderPath, label } of folders) {
      stats.images += cleanFolder(folderPath, cutoffMs, label);
    }
  } catch (err) {
    logger.error(`[cleanup] Image cleanup failed: ${err.message}`);
  }

  logger.info(`[cleanup] ─── Cleanup complete ──────────────────────────`);
  logger.info(`[cleanup] Summary: cycles=${stats.cycles} messages=${stats.messages} images=${stats.images}`);

  return stats;
}

/* ─── Schedule ─────────────────────────────────────────── */
function convertToCron(time) {
  const [hour, minute] = time.split(":");
  return `${minute} ${hour} * * *`;
}

const cronExpr = convertToCron(CLEANUP_TIME);
cron.schedule(cronExpr, () => runCleanup());

logger.info(`[cleanup] Scheduled | enabled=${ENABLE} | retention=${RETENTION_DAYS}d | time=${CLEANUP_TIME} | cron=${cronExpr}`);

module.exports = runCleanup;
