const { createTransporter }                                    = require("../config/mailer");
const { getUnsentCycles, markCyclesSent, getReportData }       = require("../models/message.model");
const { getActiveRecipients, createEmailLog, getSmtpSettings } = require("../models/email.model");
const { buildReportEmailHtml }                                 = require("../utils/emailTemplate");
const { buildReportZip }                                       = require("./excel.service");
const logger                                                   = require("../utils/logger");

// Retry configuration
const MAX_RETRIES   = 3;
const RETRY_WAIT_MS = 10_000; // 10 seconds between retries

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

function tsStamp() {
  const pad = (n) => String(n).padStart(2, "0");
  const d   = new Date();
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE SEND — build ZIP first, then send, with retry
//   Each attempt is logged individually in Email History.
//   On success, cycles are marked as sent.
// ─────────────────────────────────────────────────────────────────────────────
async function buildAndSend({ rows, smtp, recipients, companyId, action, fromLabel, toLabel }) {
  const { total, pass, nr } = statsOf(rows);

  // ── 1. Build ZIP (done once before any send attempt) ──────────────────────
  let zipBuffer  = null;
  let attachments = [];

  if (total > 0) {
    logger.info(`[email-service] Building ZIP for ${total} records...`);
    try {
      zipBuffer = await buildReportZip(rows, { fromLabel, toLabel });
      logger.info(`[email-service] ZIP ready: ${zipBuffer.length} bytes`);

      // ZIP filename matches what's inside — unique per run
      function labelToSlug(lbl) {
        return lbl.replace(/[-: ]/g, "").slice(0, 13);
      }
      const pad  = (n) => String(n).padStart(2, "0");
      const d    = new Date();
      const now  = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
      const from = fromLabel ? labelToSlug(fromLabel) : now;
      const to   = toLabel   ? labelToSlug(toLabel)   : from;
      const zipName = `ToteTrack_Report_${from}_to_${to}.zip`;

      attachments = [{
        filename:    zipName,
        content:     zipBuffer,
        contentType: "application/zip",
      }];
    } catch (zipErr) {
      logger.error(`[email-service] ZIP build failed: ${zipErr.message}`);
      await safeLog({
        record_count:  total,
        status:        "failed",
        error_message: `ZIP build failed: ${zipErr.message}`,
        date_from:     fromLabel,
        date_to:       toLabel,
        action,
        recipients:    recipients.join(", "),
      }, companyId);
      return { success: false, error: zipErr.message };
    }
  }

  // ── 2. Build HTML (once — small, no issue) ────────────────────────────────
  const html = buildReportEmailHtml({
    rows, fromLabel, toLabel, total, pass, nr,
    recipientCount: recipients.length,
  });

  const subject = `ToteTrack Report — ${total} Totes (PASS: ${pass} / NR: ${nr}) | ${nowIST()}`;

  // ── 3. Retry loop — fresh transporter each attempt ────────────────────────
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    logger.info(`[email-service] Send attempt ${attempt}/${MAX_RETRIES}...`);

    try {
      // Fresh transporter + sendMail immediately — no async work in between
      const transporter = await createTransporter(companyId);
      await transporter.sendMail({
        from:        `${smtp.from_name} <${smtp.user}>`,
        to:          recipients.join(", "),
        subject,
        html,
        attachments,
      });

      // ── SUCCESS ────────────────────────────────────────────────────────────
      if (total > 0) {
        await markCyclesSent(rows.map(r => r.id));
      }

      await safeLog({
        record_count: total,
        status:       "success",
        date_from:    fromLabel,
        date_to:      toLabel,
        action:       attempt > 1 ? `${action} (succeeded on attempt ${attempt})` : action,
        recipients:   recipients.join(", "),
      }, companyId);

      logger.info(`[email-service] Sent successfully on attempt ${attempt} — ${total} records`);
      return { success: true, count: total, pass, nr };

    } catch (err) {
      lastError = err;
      logger.error(`[email-service] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);

      // Log every failed attempt individually in Email History
      await safeLog({
        record_count:  total,
        status:        "failed",
        error_message: `Attempt ${attempt}/${MAX_RETRIES}: ${err.message}`,
        date_from:     fromLabel,
        date_to:       toLabel,
        action:        `${action} (attempt ${attempt}/${MAX_RETRIES})`,
        recipients:    recipients.join(", "),
      }, companyId);

      if (attempt < MAX_RETRIES) {
        logger.info(`[email-service] Waiting ${RETRY_WAIT_MS / 1000}s before retry...`);
        await delay(RETRY_WAIT_MS);
      }
    }
  }

  // ── ALL RETRIES EXHAUSTED ─────────────────────────────────────────────────
  logger.error(`[email-service] All ${MAX_RETRIES} attempts failed. Last error: ${lastError?.message}`);
  return { success: false, error: lastError?.message };
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULER — sends all unsent zone_cycles in one email
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
  const { fromLabel, toLabel } = dateLabel(rows);

  logger.info(`[scheduler] ${rows.length} unsent records | range: ${fromLabel} → ${toLabel}`);

  return buildAndSend({
    rows,
    smtp,
    recipients,
    companyId,
    action:    "Scheduled Report",
    fromLabel,
    toLabel,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL REPORT — date-range report from the Reports page
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

  return buildAndSend({
    rows,
    smtp,
    recipients,
    companyId,
    action,
    fromLabel: fromLabel || fromDt,
    toLabel:   toLabel   || toDt,
  });
}

// ── Exports — at the bottom so both functions are fully defined ────────────
module.exports = { sendEmailReport, sendReportEmail };
