const { createTransporter }                                    = require("../config/mailer");
const { getUnsentCycles, markCyclesSent, getReportData }       = require("../models/message.model");
const { getActiveRecipients, createEmailLog, getSmtpSettings } = require("../models/email.model");
const { buildReportEmailHtml }                                 = require("../utils/emailTemplate");
const { buildReportZip }                                       = require("./excel.service");
const emailLogger                                              = require("../utils/emailLogger");
const fs                                                       = require("fs");
const path                                                     = require("path");
const os                                                       = require("os");

// Configuration
const MAX_RETRIES     = 3;
const RETRY_WAIT_MS   = 30_000; // 30s between retries
const ZONE_GAP_MS     = 30_000; // 30s between zone emails
const IMAGE_THRESHOLD = 1500;   // above this, skip NR images per zone

// ── Helpers ────────────────────────────────────────────────────────────────
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function sep(label) {
  return `─── ${label} ${"─".repeat(Math.max(0, 50 - label.length))}`;
}

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
    emailLogger.error(`DB log write failed: ${err.message}`);
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

function groupByZone(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.zone_name || `Zone ${r.zone_id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE SEND — one zone, with ZIP build + retry
// ─────────────────────────────────────────────────────────────────────────────
async function buildAndSend({ rows, smtp, recipients, companyId, action, fromLabel, toLabel, zoneName }) {
  const { total, pass, nr } = statsOf(rows);
  const tag = `[${zoneName}]`;

  emailLogger.info(`${tag} ${sep("START")}`);
  emailLogger.info(`${tag} Records : ${total} (PASS: ${pass} / NR: ${nr})`);
  emailLogger.info(`${tag} Period  : ${fromLabel} → ${toLabel}`);
  emailLogger.info(`${tag} To      : ${recipients.join(", ")}`);

  let tmpZipPath  = null;
  let attachments = [];

  // ── Step 1: Build ZIP ────────────────────────────────────────────────────
  if (total > 0) {
    const includeImages = total <= IMAGE_THRESHOLD;
    emailLogger.info(`${tag} Step 1 : Building ZIP — images ${includeImages ? "INCLUDED" : `SKIPPED (${total} > ${IMAGE_THRESHOLD} threshold)`}`);

    try {
      const zipBuffer = await buildReportZip(rows, { fromLabel, toLabel, includeImages });
      const sizeKB    = (zipBuffer.length / 1024).toFixed(1);
      const sizeMB    = zipBuffer.length / (1024 * 1024);
      emailLogger.info(`${tag} Step 1 : ZIP ready — ${sizeKB} KB`);

      // Gmail hard limit is 25MB. Base64 encoding adds ~33% overhead.
      // Safe limit: if ZIP > 18MB, rebuild without images to stay under 25MB.
      if (sizeMB > 18 && includeImages) {
        emailLogger.warn(`${tag} Step 1 : ZIP is ${sizeKB} KB > 18 MB — rebuilding without images to stay under Gmail's 25MB limit`);
        const zipBufferNoImg = await buildReportZip(rows, { fromLabel, toLabel, includeImages: false });
        const sizeKBNoImg    = (zipBufferNoImg.length / 1024).toFixed(1);
        emailLogger.info(`${tag} Step 1 : ZIP without images — ${sizeKBNoImg} KB`);
        tmpZipPath = path.join(os.tmpdir(), `totetrack_${zoneName.replace(/\s+/g, "_")}_${Date.now()}.zip`);
        fs.writeFileSync(tmpZipPath, zipBufferNoImg);
      } else {
        tmpZipPath = path.join(os.tmpdir(), `totetrack_${zoneName.replace(/\s+/g, "_")}_${Date.now()}.zip`);
        fs.writeFileSync(tmpZipPath, zipBuffer);
      }
      emailLogger.info(`${tag} Step 1 : ZIP written to temp file`);

      function labelToSlug(lbl) { return lbl.replace(/[-: ]/g, "").slice(0, 13); }
      const pad  = (n) => String(n).padStart(2, "0");
      const d    = new Date();
      const now  = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      const from = fromLabel ? labelToSlug(fromLabel) : now;
      const to   = toLabel   ? labelToSlug(toLabel)   : from;
      const zipName = `ToteTrack_${zoneName.replace(/\s+/g, "_")}_${from}_to_${to}.zip`;

      attachments = [{ filename: zipName, path: tmpZipPath, contentType: "application/zip" }];
      emailLogger.info(`${tag} Step 1 : Attachment name — ${zipName}`);
    } catch (zipErr) {
      emailLogger.error(`${tag} Step 1 : ZIP build FAILED — ${zipErr.message}`);
      await safeLog({
        record_count: total, status: "failed",
        error_message: `ZIP build failed: ${zipErr.message}`,
        date_from: fromLabel, date_to: toLabel,
        action: `${action} [${zoneName}]`,
        recipients: recipients.join(", "),
      }, companyId);
      return { success: false, error: zipErr.message };
    }
  } else {
    emailLogger.info(`${tag} Step 1 : No records — skipping ZIP`);
  }

  // ── Step 2: Build HTML ───────────────────────────────────────────────────
  emailLogger.info(`${tag} Step 2 : Building email HTML...`);
  const includeImages = total <= IMAGE_THRESHOLD;
  const html = buildReportEmailHtml({
    rows, fromLabel, toLabel, total, pass, nr,
    recipientCount: recipients.length,
    includeImages,
  });
  emailLogger.info(`${tag} Step 2 : HTML ready`);

  const subject = `ToteTrack [${zoneName}] — ${total} Totes (PASS: ${pass} / NR: ${nr}) | ${nowIST()}`;
  emailLogger.info(`${tag} Subject : ${subject}`);

  // ── Step 3: Send with retry ──────────────────────────────────────────────
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    emailLogger.info(`${tag} Step 3 : Send attempt ${attempt}/${MAX_RETRIES} — connecting to SMTP...`);

    try {
      const transporter = await createTransporter(companyId);
      emailLogger.info(`${tag} Step 3 : SMTP connected — uploading email...`);

      await transporter.sendMail({
        from:    `${smtp.from_name} <${smtp.user}>`,
        to:      recipients.join(", "),
        subject,
        html,
        attachments,
      });

      // ── SUCCESS ────────────────────────────────────────────────────────────
      emailLogger.info(`${tag} Step 3 : ✅ SENT successfully on attempt ${attempt}`);

      if (total > 0) {
        emailLogger.info(`${tag} Step 4 : Marking ${total} cycles as email_sent=1...`);
        await markCyclesSent(rows.map(r => r.id));
        emailLogger.info(`${tag} Step 4 : Cycles marked as sent`);
      }

      await safeLog({
        record_count: total, status: "success",
        date_from: fromLabel, date_to: toLabel,
        action: attempt > 1 ? `${action} [${zoneName}] (attempt ${attempt})` : `${action} [${zoneName}]`,
        recipients: recipients.join(", "),
      }, companyId);

      if (tmpZipPath && fs.existsSync(tmpZipPath)) {
        try { fs.unlinkSync(tmpZipPath); } catch (_) {}
        emailLogger.info(`${tag} Temp ZIP file cleaned up`);
      }

      emailLogger.info(`${tag} ${sep("DONE")}`);
      return { success: true, count: total, pass, nr };

    } catch (err) {
      lastError = err;
      emailLogger.error(`${tag} Step 3 : ❌ Attempt ${attempt}/${MAX_RETRIES} FAILED — ${err.message}`);

      await safeLog({
        record_count: total, status: "failed",
        error_message: `Attempt ${attempt}/${MAX_RETRIES}: ${err.message}`,
        date_from: fromLabel, date_to: toLabel,
        action: `${action} [${zoneName}] (attempt ${attempt}/${MAX_RETRIES})`,
        recipients: recipients.join(", "),
      }, companyId);

      if (attempt < MAX_RETRIES) {
        emailLogger.info(`${tag} Waiting ${RETRY_WAIT_MS / 1000}s before retry ${attempt + 1}...`);
        await delay(RETRY_WAIT_MS);
      }
    }
  }

  if (tmpZipPath && fs.existsSync(tmpZipPath)) {
    try { fs.unlinkSync(tmpZipPath); } catch (_) {}
  }

  emailLogger.error(`${tag} ${sep("FAILED — all retries exhausted")}`);
  emailLogger.error(`${tag} Last error: ${lastError?.message}`);
  return { success: false, error: lastError?.message };
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND ALL ZONES — sequential, zone2 starts only after zone1 succeeds
// ─────────────────────────────────────────────────────────────────────────────
async function sendAllZones({ rows, smtp, recipients, companyId, action }) {
  const zoneMap    = groupByZone(rows);
  const zoneNames  = [...zoneMap.keys()];
  const totalZones = zoneNames.length;

  emailLogger.info(`═══════════════════════════════════════════════════════`);
  emailLogger.info(`  EMAIL JOB STARTED — ${nowIST()}`);
  emailLogger.info(`  Action    : ${action}`);
  emailLogger.info(`  Total     : ${rows.length} records across ${totalZones} zone(s)`);
  emailLogger.info(`  Zones     : ${zoneNames.join(", ") || "none"}`);
  emailLogger.info(`  Recipients: ${recipients.join(", ")}`);
  emailLogger.info(`═══════════════════════════════════════════════════════`);

  // 0-record notification
  if (zoneMap.size === 0) {
    emailLogger.info(`No unsent records — sending 0-record notification email`);
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
      emailLogger.info(`0-record notification sent ✅`);
      await safeLog({ record_count: 0, status: "success", action: `${action} (0 records)`, recipients: recipients.join(", ") }, companyId);
    } catch (err) {
      emailLogger.error(`0-record notification FAILED — ${err.message}`);
      await safeLog({ record_count: 0, status: "failed", error_message: err.message, action: `${action} (0 records)`, recipients: recipients.join(", ") }, companyId);
    }
    emailLogger.info(`═══════════════════════════════════════════════════════`);
    return { success: true, count: 0, zones: 0 };
  }

  let totalSent  = 0;
  let failedZones = 0;

  for (let i = 0; i < zoneNames.length; i++) {
    const zoneName = zoneNames[i];
    const zoneRows = zoneMap.get(zoneName);
    const { fromLabel, toLabel } = dateLabel(zoneRows);

    emailLogger.info(`Processing zone ${i + 1} of ${totalZones}: ${zoneName}`);

    const result = await buildAndSend({
      rows: zoneRows, smtp, recipients, companyId, action,
      fromLabel, toLabel, zoneName,
    });

    if (result.success) {
      totalSent += result.count;
      if (i < zoneNames.length - 1) {
        emailLogger.info(`[${zoneName}] ✅ Done. Waiting ${ZONE_GAP_MS / 1000}s before next zone (${zoneNames[i + 1]})...`);
        await delay(ZONE_GAP_MS);
      }
    } else {
      failedZones++;
      emailLogger.error(`[${zoneName}] ❌ Failed after all retries — stopping job. Remaining zones will retry on next scheduler run.`);
      break;
    }
  }

  const status = failedZones === 0 ? "✅ ALL ZONES SENT" : `⚠️  ${failedZones} ZONE(S) FAILED`;
  emailLogger.info(`═══════════════════════════════════════════════════════`);
  emailLogger.info(`  EMAIL JOB COMPLETE — ${nowIST()}`);
  emailLogger.info(`  Status    : ${status}`);
  emailLogger.info(`  Sent      : ${totalSent} records across ${totalZones - failedZones}/${totalZones} zones`);
  emailLogger.info(`═══════════════════════════════════════════════════════`);

  return { success: failedZones < totalZones, count: totalSent, zones: totalZones, failedZones };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULER
// ─────────────────────────────────────────────────────────────────────────────
async function sendEmailReport(companyId = 1) {
  emailLogger.info(`Scheduler triggered — Company ID ${companyId}`);

  const recipients = await getActiveRecipients(companyId);
  if (!recipients.length) {
    emailLogger.warn(`No active recipients — skipping`);
    await safeLog({ record_count: 0, status: "skipped", error_message: "No active recipients configured", action: "Scheduled Report", recipients: "" }, companyId);
    return { skipped: true, reason: "No active recipients" };
  }

  const smtp = await getSmtpSettings(companyId);
  if (!smtp) {
    emailLogger.warn(`SMTP not configured — skipping`);
    await safeLog({ record_count: 0, status: "skipped", error_message: "SMTP settings not configured", action: "Scheduled Report", recipients: recipients.join(", ") }, companyId);
    return { skipped: true, reason: "SMTP settings not configured" };
  }

  const rows = await getUnsentCycles(companyId);
  emailLogger.info(`Unsent records found: ${rows.length}`);

  return sendAllZones({ rows, smtp, recipients, companyId, action: "Scheduled Report" });
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL REPORT
// ─────────────────────────────────────────────────────────────────────────────
async function sendReportEmail({ fromDt, toDt, status = "all", zoneId = null, fromLabel, toLabel, companyId = 1 }) {
  emailLogger.info(`Manual report triggered — from=${fromDt} to=${toDt} status=${status} zoneId=${zoneId || "all"}`);

  const action = `Manual Report (${status === "all" ? "All" : status}) ${fromLabel || fromDt} → ${toLabel || toDt}`;

  const recipients = await getActiveRecipients(companyId);
  if (!recipients.length) {
    emailLogger.warn(`No active recipients — skipping`);
    await safeLog({ record_count: 0, status: "skipped", error_message: "No active recipients configured", date_from: fromDt, date_to: toDt, action, recipients: "" }, companyId);
    return { skipped: true, reason: "No active recipients configured" };
  }

  const smtp = await getSmtpSettings(companyId);
  if (!smtp) {
    emailLogger.warn(`SMTP not configured — skipping`);
    await safeLog({ record_count: 0, status: "skipped", error_message: "SMTP settings not configured", date_from: fromDt, date_to: toDt, action, recipients: recipients.join(", ") }, companyId);
    return { skipped: true, reason: "SMTP settings not configured" };
  }

  const rows = await getReportData({ fromDt, toDt, status, zoneId });
  emailLogger.info(`Records found: ${rows.length}`);

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

module.exports = { sendEmailReport, sendReportEmail };
