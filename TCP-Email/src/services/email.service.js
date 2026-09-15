const { createTransporter }                                    = require("../config/mailer");
const { getUnsentCycles, markCyclesSent, getReportData }       = require("../models/message.model");
const { getActiveRecipients, createEmailLog, getSmtpSettings } = require("../models/email.model");
const { buildReportEmailHtml }                                 = require("../utils/emailTemplate");
const { buildReportZip }                                       = require("./excel.service");
const logger                                                   = require("../utils/logger");

// ── Shared safe log writer — never throws ─────────────────────────────────
async function safeLog(payload, companyId) {
  try {
    await createEmailLog(payload, companyId);
  } catch (logErr) {
    logger.error(`[email-service] Failed to write email log: ${logErr.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULER — sends all unsent zone_cycles for a company
// ─────────────────────────────────────────────────────────────────────────────
async function sendEmailReport(companyId = 1) {
  logger.info(`[scheduler] Email job triggered for Company ID ${companyId}`);

  const recipients = await getActiveRecipients(companyId);
  if (!recipients.length) {
    logger.warn(`[scheduler] No active recipients for Company ID ${companyId}, skipping.`);
    await safeLog({
      record_count:  0,
      status:        "skipped",
      error_message: "No active recipients configured",
      action:        "Scheduled Report",
      recipients:    "",
    }, companyId);
    return { skipped: true, reason: "No active recipients" };
  }

  const smtp = await getSmtpSettings(companyId);
  if (!smtp) {
    logger.warn(`[scheduler] SMTP not configured for Company ID ${companyId}, skipping.`);
    await safeLog({
      record_count:  0,
      status:        "skipped",
      error_message: "SMTP settings not configured",
      action:        "Scheduled Report",
      recipients:    recipients.join(", "),
    }, companyId);
    return { skipped: true, reason: "SMTP settings not configured" };
  }

  const rows      = await getUnsentCycles(companyId);
  const total     = rows.length;
  const pass      = rows.filter(r => r.status === "PASS").length;
  const nr        = rows.filter(r => r.status === "NR").length;
  const dates     = rows.map(r => r.started_at).sort();
  const fromLabel = dates[0]?.slice(0, 16).replace("T", " ") || "";
  const toLabel   = dates[dates.length - 1]?.slice(0, 16).replace("T", " ") || "";

  if (!total) {
    logger.info(`[scheduler] No unsent cycles for Company ID ${companyId} — sending 0-record notification.`);
  } else {
    logger.info(`[scheduler] Sending ${total} cycles (PASS:${pass} NR:${nr}) from ${fromLabel} → ${toLabel}`);
  }

  // Build ZIP (empty ZIP when 0 records)
  let zipBuffer;
  try {
    zipBuffer = await buildReportZip(rows);
    logger.info(`[scheduler] ZIP built: ${zipBuffer.length} bytes`);
  } catch (zipErr) {
    logger.error(`[scheduler] ZIP build failed: ${zipErr.message}`);
    await safeLog({
      record_count:  total,
      status:        "failed",
      error_message: `ZIP build failed: ${zipErr.message}`,
      date_from:     fromLabel,
      date_to:       toLabel,
      action:        "Scheduled Report",
      recipients:    recipients.join(", "),
    }, companyId);
    return { success: false, error: zipErr.message };
  }

  const html = buildReportEmailHtml({
    rows, fromLabel, toLabel, total, pass, nr,
    recipientCount: recipients.length,
  });

  const pad = (n) => String(n).padStart(2, "0");
  const d   = new Date();
  const ts  = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;

  try {
    // Create transporter right before sending — not before ZIP build
    const transporter = await createTransporter(companyId);
    await transporter.sendMail({
      from:    `${smtp.from_name} <${smtp.user}>`,
      to:      recipients.join(", "),
      subject: `ToteTrack Cycle Report — ${total} cycles (PASS: ${pass} / NR: ${nr}) | ${fromLabel || "Scheduled"}`,
      html,
      attachments: [{
        filename:    `TCP_Report_${ts}.zip`,
        content:     zipBuffer,
        contentType: "application/zip",
      }],
    });

    if (total > 0) {
      const ids = rows.map(r => r.id);
      await markCyclesSent(ids);
    }

    await safeLog({
      record_count: total,
      status:       "success",
      date_from:    fromLabel,
      date_to:      toLabel,
      action:       `Scheduled Report (PASS: ${pass} / NR: ${nr})`,
      recipients:   recipients.join(", "),
    }, companyId);

    logger.info(`[scheduler] Email sent — ${total} cycles${total > 0 ? " marked as sent" : " (0-record notification)"}`);
    return { success: true, count: total, pass, nr };

  } catch (err) {
    await safeLog({
      record_count:  total,
      status:        "failed",
      error_message: err.message,
      date_from:     fromLabel,
      date_to:       toLabel,
      action:        "Scheduled Report",
      recipients:    recipients.join(", "),
    }, companyId);
    logger.error(`[scheduler] Email failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = { sendEmailReport, sendReportEmail };

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL REPORT — date-range report from the Reports page
// ─────────────────────────────────────────────────────────────────────────────
async function sendReportEmail({ fromDt, toDt, status = "all", zoneId = null, fromLabel, toLabel, companyId = 1 }) {
  logger.info(`[report-email] Triggered: from=${fromDt} to=${toDt} status=${status} zoneId=${zoneId || "all"} company=${companyId}`);

  const action = `Manual Report (${status === "all" ? "All" : status}) ${fromLabel || fromDt} → ${toLabel || toDt}`;

  // ── Recipients ────────────────────────────────────────────────────────────
  const recipients = await getActiveRecipients(companyId);
  if (!recipients.length) {
    logger.warn("[report-email] No active recipients, skipping.");
    await safeLog({
      record_count:  0,
      status:        "skipped",
      error_message: "No active recipients configured",
      date_from:     fromDt,
      date_to:       toDt,
      action,
      recipients:    "",
    }, companyId);
    return { skipped: true, reason: "No active recipients configured" };
  }

  // ── SMTP ──────────────────────────────────────────────────────────────────
  const smtp = await getSmtpSettings(companyId);
  if (!smtp) {
    logger.warn("[report-email] SMTP not configured, skipping.");
    await safeLog({
      record_count:  0,
      status:        "skipped",
      error_message: "SMTP settings not configured",
      date_from:     fromDt,
      date_to:       toDt,
      action,
      recipients:    recipients.join(", "),
    }, companyId);
    return { skipped: true, reason: "SMTP settings not configured" };
  }

  // ── Data (0 records is allowed — still send) ──────────────────────────────
  const rows  = await getReportData({ fromDt, toDt, status, zoneId });
  const total = rows.length;
  const pass  = rows.filter(r => r.status === "PASS").length;
  const nr    = rows.filter(r => r.status === "NR").length;

  if (!total) {
    logger.info("[report-email] 0 records found — sending empty report notification.");
  } else {
    logger.info(`[report-email] ${total} records (PASS:${pass} NR:${nr})`);
  }

  // ── Build ZIP ─────────────────────────────────────────────────────────────
  let zipBuffer;
  try {
    zipBuffer = await buildReportZip(rows);
    logger.info(`[report-email] ZIP built: ${zipBuffer.length} bytes`);
  } catch (zipErr) {
    logger.error(`[report-email] ZIP build failed: ${zipErr.message}`);
    await safeLog({
      record_count:  total,
      status:        "failed",
      error_message: `ZIP build failed: ${zipErr.message}`,
      date_from:     fromDt,
      date_to:       toDt,
      action,
      recipients:    recipients.join(", "),
    }, companyId);
    throw zipErr;
  }

  // ── Build HTML ────────────────────────────────────────────────────────────
  const html = buildReportEmailHtml({
    rows,
    fromLabel: fromLabel || fromDt,
    toLabel:   toLabel   || toDt,
    total, pass, nr,
    recipientCount: recipients.length,
  });

  const pad = (n) => String(n).padStart(2, "0");
  const d   = new Date();
  const ts  = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;

  // ── Send — transporter created right before send ──────────────────────────
  try {
    const transporter = await createTransporter(companyId);
    await transporter.sendMail({
      from:    `${smtp.from_name} <${smtp.user}>`,
      to:      recipients.join(", "),
      subject: `ToteTrack Cycle Report — ${total} cycles (PASS: ${pass} / NR: ${nr}) | ${fromLabel || fromDt}`,
      html,
      attachments: [{
        filename:    `TCP_Report_${ts}.zip`,
        content:     zipBuffer,
        contentType: "application/zip",
      }],
    });

    await safeLog({
      record_count: total,
      status:       "success",
      date_from:    fromDt,
      date_to:      toDt,
      action,
      recipients:   recipients.join(", "),
    }, companyId);

    logger.info(`[report-email] Sent to ${recipients.join(", ")} — ${total} records`);
    return { success: true, count: total, pass, nr, recipients: recipients.length };

  } catch (err) {
    await safeLog({
      record_count:  total,
      status:        "failed",
      error_message: err.message,
      date_from:     fromDt,
      date_to:       toDt,
      action,
      recipients:    recipients.join(", "),
    }, companyId);
    logger.error(`[report-email] Send failed: ${err.message}`);
    throw err;
  }
}
