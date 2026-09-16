const { createTransporter }                                    = require("../config/mailer");
const { getUnsentCycles, markCyclesSent, getReportData }       = require("../models/message.model");
const { getActiveRecipients, createEmailLog, getSmtpSettings } = require("../models/email.model");
const { buildReportEmailHtml }                                 = require("../utils/emailTemplate");
const { buildReportZip }                                       = require("./excel.service");
const logger                                                   = require("../utils/logger");
const fs                                                       = require("fs");
const path                                                     = require("path");
const os                                                       = require("os");

// Configuration
const MAX_RETRIES     = 3;
const RETRY_WAIT_MS   = 10_000; // 10 seconds between retries
const ZONE_GAP_MS     = 5_000;  // 5 seconds between zone emails
const IMAGE_THRESHOLD = 1500;   // above this, skip NR images per zone

// ── Helpers ────────────────────────────────────────────────────────────────
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function nowIST() {
  const formatter = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const p = formatter.formatToParts(new Date());
  const g = (type) => p.find(x => x.type === type).value;
  return `${g("day")}-${g("month")}-${g("year")} ${g("hour")}:${g("minute")}:${g("second")}`;
}

async function safeLog(payload, companyId) {
  try {
    await createEmailLog(payload, companyId);
  } catch (err) {
    logger.error(`[email-service] Log write failed: ${err.message}`);
  }
}

function dateLabel(rows) {
  if (!rows || !rows.length) return { fromLabel: "", toLabel: "" };
  const sorted    = [...rows].map(r => r.started_at).sort();
  const fromLabel = sorted[0]?.slice(0, 16).replace("T", " ") || "";
  const toLabel   = sorted[sorted.length - 1]?.slice(0, 16).replace("T", " ") || "";
  return { fromLabel, toLabel };
}

function statsOf(rows) {
  const total = rows.length;
  const pass  = rows.filter(r => r.status === "PASS").length;
  const nr    = rows.filter(r => r.status === "NR").length;
  return { total, pass, nr };
}

/** Group rows by zone_name, preserving zone order */
function groupByZone(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.zone_name || `Zone ${r.zone_id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return map; // Map<zoneName, rows[]>
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE SEND — build ZIP then send with retry for one zone's rows
// ─────────────────────────────────────────────────────────────────────────────
async function buildAndSend({ rows, smtp, recipients, companyId, action, fromLabel, toLabel, zoneName }) {
  const { total, pass, nr } = statsOf(rows);

  // Clean up temp files after send (success or failure)
  let tmpZipPath  = null;
  let attachments = [];

  if (total > 0) {
    const includeImages = total <= IMAGE_THRESHOLD;
    if (!includeImages) {
      logger.info(`[email-service] ${zoneName}: ${total} records > ${IMAGE_THRESHOLD} — skipping images`);
    }
    logger.info(`[email-service] ${zoneName}: Building ZIP for ${total} records (images: ${includeImages})...`);

    try {
      const zipBuffer = await buildReportZip(rows, { fromLabel, toLabel, includeImages });
      logger.info(`[email-service] ${zoneName}: ZIP ready — ${zipBuffer.length} bytes`);

      tmpZipPath = path.join(os.tmpdir(), `totetrack_${zoneName.replace(/\s+/g, "_")}_${Date.now()}.zip`);
      fs.writeFileSync(tmpZipPath, zipBuffer);

      function labelToSlug(lbl) { return lbl.replace(/[-: ]/g, "").slice(0, 13); }
      const pad  = (n) => String(n).padStart(2, "0");
      const d    = new Date();
      const now  = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      const from = fromLabel ? labelToSlug(fromLabel) : now;
      const to   = toLabel   ? labelToSlug(toLabel)   : from;
      const zipName = `ToteTrack_${zoneName.replace(/\s+/g, "_")}_${from}_to_${to}.zip`;

      attachments = [{
        filename:    zipName,
        path:        tmpZipPath,
        contentType: "application/zip",
      }];
    } catch (zipErr) {
      logger.error(`[email-service] ${zoneName}: ZIP build failed: ${zipErr.message}`);
      await safeLog({
        record_count: total, status: "failed",
        error_message: `ZIP build failed: ${zipErr.message}`,
        date_from: fromLabel, date_to: toLabel,
        action: `${action} [${zoneName}]`,
        recipients: recipients.join(", "),
      }, companyId);
      return { success: false, error: zipErr.message };
    }
  }

  const includeImages = total <= IMAGE_THRESHOLD;
  const html = buildReportEmailHtml({
    rows, fromLabel, toLabel, total, pass, nr,
    recipientCount: recipients.length,
    includeImages,
  });

  const subject = `ToteTrack [${zoneName}] — ${total} Totes (PASS: ${pass} / NR: ${nr}) | ${nowIST()}`;

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    logger.info(`[email-service] ${zoneName}: Send attempt ${attempt}/${MAX_RETRIES}...`);

    try {
      const transporter = await createTransporter(companyId);
      await transporter.sendMail({
        from:    `${smtp.from_name} <${smtp.user}>`,
        to:      recipients.join(", "),
        subject,
        html,
        attachments,
      });

      if (total > 0) {
        await markCyclesSent(rows.map(r => r.id));
      }

      await safeLog({
        record_count: total, status: "success",
        date_from: fromLabel, date_to: toLabel,
        action: attempt > 1
          ? `${action} [${zoneName}] (attempt ${attempt})`
          : `${action} [${zoneName}]`,
        recipients: recipients.join(", "),
      }, companyId);

      logger.info(`[email-service] ${zoneName}: Sent on attempt ${attempt} — ${total} records`);

      // Clean up temp file
      if (tmpZipPath && fs.existsSync(tmpZipPath)) {
        try { fs.unlinkSync(tmpZipPath); } catch (_) {}
      }

      return { success: true, count: total, pass, nr };

    } catch (err) {
      lastError = err;
      logger.error(`[email-service] ${zoneName}: Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);

      await safeLog({
        record_count: total, status: "failed",
        error_message: `Attempt ${attempt}/${MAX_RETRIES}: ${err.message}`,
        date_from: fromLabel, date_to: toLabel,
        action: `${action} [${zoneName}] (attempt ${attempt}/${MAX_RETRIES})`,
        recipients: recipients.join(", "),
      }, companyId);

      if (attempt < MAX_RETRIES) {
        logger.info(`[email-service] ${zoneName}: Waiting ${RETRY_WAIT_MS / 1000}s before retry...`);
        await delay(RETRY_WAIT_MS);
      }
    }
  }

  // Clean up temp file on final failure
  if (tmpZipPath && fs.existsSync(tmpZipPath)) {
    try { fs.unlinkSync(tmpZipPath); } catch (_) {}
  }

  logger.error(`[email-service] ${zoneName}: All ${MAX_RETRIES} attempts failed. Last: ${lastError?.message}`);
  return { success: false, error: lastError?.message };
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND ALL ZONES — sends one email per zone, sequentially with a gap between
// ─────────────────────────────────────────────────────────────────────────────
async function sendAllZones({ rows, smtp, recipients, companyId, action }) {
  const { fromLabel, toLabel } = dateLabel(rows);
  const zoneMap = groupByZone(rows);

  if (zoneMap.size === 0) {
    // 0 records — send one notification email with no attachment
    logger.info(`[email-service] 0 records — sending empty notification`);
    const html = buildReportEmailHtml({
      rows: [], fromLabel: "", toLabel: "", total: 0, pass: 0, nr: 0,
      recipientCount: recipients.length, includeImages: false,
    });
    try {
      const transporter = await createTransporter(companyId);
      await transporter.sendMail({
        from:    `${smtp.from_name} <${smtp.user}>`,
        to:      recipients.join(", "),
        subject: `ToteTrack Report — 0 Totes | ${nowIST()}`,
        html,
      });
      await safeLog({ record_count: 0, status: "success", action: `${action} (0 records)`, recipients: recipients.join(", ") }, companyId);
    } catch (err) {
      await safeLog({ record_count: 0, status: "failed", error_message: err.message, action: `${action} (0 records)`, recipients: recipients.join(", ") }, companyId);
    }
    return { success: true, count: 0, zones: 0 };
  }

  const zoneNames    = [...zoneMap.keys()];
  const totalZones   = zoneNames.length;
  let totalSent      = 0;
  let failedZones    = 0;

  logger.info(`[email-service] Sending ${rows.length} records across ${totalZones} zone(s): ${zoneNames.join(", ")}`);

  for (let i = 0; i < zoneNames.length; i++) {
    const zoneName = zoneNames[i];
    const zoneRows = zoneMap.get(zoneName);
    const { fromLabel: zFrom, toLabel: zTo } = dateLabel(zoneRows);

    logger.info(`[email-service] Zone ${i + 1}/${totalZones}: ${zoneName} — ${zoneRows.length} records`);

    const result = await buildAndSend({
      rows:       zoneRows,
      smtp,
      recipients,
      companyId,
      action,
      fromLabel:  zFrom,
      toLabel:    zTo,
      zoneName,
    });

    if (result.success) {
      totalSent += result.count;
    } else {
      failedZones++;
      logger.warn(`[email-service] Zone ${zoneName} failed — continuing with remaining zones`);
    }

    // Gap between zones — avoids rapid-fire SMTP connections
    if (i < zoneNames.length - 1) {
      logger.info(`[email-service] Waiting ${ZONE_GAP_MS / 1000}s before next zone...`);
      await delay(ZONE_GAP_MS);
    }
  }

  logger.info(`[email-service] All zones done — sent: ${totalSent}, failed zones: ${failedZones}/${totalZones}`);
  return { success: failedZones < totalZones, count: totalSent, zones: totalZones, failedZones };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULER — sends all unsent zone_cycles, one email per zone
// ─────────────────────────────────────────────────────────────────────────────
async function sendEmailReport(companyId = 1) {
  logger.info(`[scheduler] Triggered for Company ID ${companyId}`);

  const recipients = await getActiveRecipients(companyId);
  if (!recipients.length) {
    logger.warn(`[scheduler] No active recipients — skipping`);
    await safeLog({ record_count: 0, status: "skipped", error_message: "No active recipients configured", action: "Scheduled Report", recipients: "" }, companyId);
    return { skipped: true, reason: "No active recipients" };
  }

  const smtp = await getSmtpSettings(companyId);
  if (!smtp) {
    logger.warn(`[scheduler] SMTP not configured — skipping`);
    await safeLog({ record_count: 0, status: "skipped", error_message: "SMTP settings not configured", action: "Scheduled Report", recipients: recipients.join(", ") }, companyId);
    return { skipped: true, reason: "SMTP settings not configured" };
  }

  const rows = await getUnsentCycles(companyId);
  logger.info(`[scheduler] ${rows.length} unsent records`);

  return sendAllZones({ rows, smtp, recipients, companyId, action: "Scheduled Report" });
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL REPORT — date-range report from the Reports page, one email per zone
// ─────────────────────────────────────────────────────────────────────────────
async function sendReportEmail({ fromDt, toDt, status = "all", zoneId = null, fromLabel, toLabel, companyId = 1 }) {
  logger.info(`[report-email] Triggered: from=${fromDt} to=${toDt} status=${status} zoneId=${zoneId || "all"}`);

  const action = `Manual Report (${status === "all" ? "All" : status}) ${fromLabel || fromDt} → ${toLabel || toDt}`;

  const recipients = await getActiveRecipients(companyId);
  if (!recipients.length) {
    logger.warn("[report-email] No active recipients — skipping");
    await safeLog({ record_count: 0, status: "skipped", error_message: "No active recipients configured", date_from: fromDt, date_to: toDt, action, recipients: "" }, companyId);
    return { skipped: true, reason: "No active recipients configured" };
  }

  const smtp = await getSmtpSettings(companyId);
  if (!smtp) {
    logger.warn("[report-email] SMTP not configured — skipping");
    await safeLog({ record_count: 0, status: "skipped", error_message: "SMTP settings not configured", date_from: fromDt, date_to: toDt, action, recipients: recipients.join(", ") }, companyId);
    return { skipped: true, reason: "SMTP settings not configured" };
  }

  const rows = await getReportData({ fromDt, toDt, status, zoneId });
  logger.info(`[report-email] ${rows.length} records found`);

  // If a specific zone was requested, send as single email (not zone-split)
  // Otherwise split by zone
  if (zoneId) {
    const zoneName = rows[0]?.zone_name || `Zone ${zoneId}`;
    const { fromLabel: zFrom, toLabel: zTo } = dateLabel(rows);
    return buildAndSend({
      rows, smtp, recipients, companyId, action,
      fromLabel: zFrom || fromLabel || fromDt,
      toLabel:   zTo   || toLabel   || toDt,
      zoneName,
    });
  }

  return sendAllZones({ rows, smtp, recipients, companyId, action });
}

// ── Exports ────────────────────────────────────────────────────────────────
module.exports = { sendEmailReport, sendReportEmail };
