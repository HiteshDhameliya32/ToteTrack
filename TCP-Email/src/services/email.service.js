const { createTransporter }                                    = require("../config/mailer");
const { getUnsentCycles, markCyclesSent, getReportData }       = require("../models/message.model");
const { getActiveRecipients, createEmailLog, getSmtpSettings } = require("../models/email.model");
const { buildReportEmailHtml }                                 = require("../utils/emailTemplate");
const { buildReportZip }                                       = require("./excel.service");
const logger                                                   = require("../utils/logger");

// Records per email batch
const BATCH_SIZE = 800;

// ── Shared safe log writer — never throws ─────────────────────────────────
async function safeLog(payload, companyId) {
  try {
    await createEmailLog(payload, companyId);
  } catch (logErr) {
    logger.error(`[email-service] Failed to write email log: ${logErr.message}`);
  }
}

// ── Send one batch of rows as a single email ───────────────────────────────
async function sendBatch({ batch, batchNum, totalBatches, smtp, recipients, companyId }) {
  const total     = batch.length;
  const pass      = batch.filter(r => r.status === "PASS").length;
  const nr        = batch.filter(r => r.status === "NR").length;
  const dates     = batch.map(r => r.started_at).sort();
  const fromLabel = dates[0]?.slice(0, 16).replace("T", " ") || "";
  const toLabel   = dates[dates.length - 1]?.slice(0, 16).replace("T", " ") || "";

  const batchLabel = totalBatches > 1 ? ` [Part ${batchNum}/${totalBatches}]` : "";
  const action     = `Scheduled Report (PASS: ${pass} / NR: ${nr})${batchLabel}`;

  logger.info(`[scheduler] Batch ${batchNum}/${totalBatches} — ${total} cycles (PASS:${pass} NR:${nr}) ${fromLabel} → ${toLabel}`);

  // Build ZIP
  let attachments = [];
  try {
    const zipBuffer = await buildReportZip(batch);
    logger.info(`[scheduler] Batch ${batchNum} ZIP built: ${zipBuffer.length} bytes`);
    const pad = (n) => String(n).padStart(2, "0");
    const d   = new Date();
    const ts  = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    attachments = [{ filename: `TCP_Report_${ts}_part${batchNum}.zip`, content: zipBuffer, contentType: "application/zip" }];
  } catch (zipErr) {
    logger.error(`[scheduler] Batch ${batchNum} ZIP build failed: ${zipErr.message}`);
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

  const html = buildReportEmailHtml({
    rows: batch, fromLabel, toLabel, total, pass, nr,
    recipientCount: recipients.length,
  });

  // Create transporter right before send
  try {
    const transporter = await createTransporter(companyId);
    await transporter.sendMail({
      from:        `${smtp.from_name} <${smtp.user}>`,
      to:          recipients.join(", "),
      subject:     `ToteTrack Cycle Report — ${total} cycles (PASS: ${pass} / NR: ${nr}) | ${fromLabel}${batchLabel}`,
      html,
      attachments,
    });

    // Mark this batch as sent immediately after successful send
    const ids = batch.map(r => r.id);
    await markCyclesSent(ids);

    await safeLog({
      record_count: total,
      status:       "success",
      date_from:    fromLabel,
      date_to:      toLabel,
      action,
      recipients:   recipients.join(", "),
    }, companyId);

    logger.info(`[scheduler] Batch ${batchNum}/${totalBatches} sent — ${total} cycles marked as sent`);
    return { success: true, count: total, pass, nr };

  } catch (err) {
    await safeLog({
      record_count:  total,
      status:        "failed",
      error_message: err.message,
      date_from:     fromLabel,
      date_to:       toLabel,
      action,
      recipients:    recipients.join(", "),
    }, companyId);
    logger.error(`[scheduler] Batch ${batchNum}/${totalBatches} send failed: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULER — sends all unsent zone_cycles in batches of BATCH_SIZE
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

  const allRows = await getUnsentCycles(companyId);

  // ── 0-record notification ─────────────────────────────────────────────────
  if (!allRows.length) {
    logger.info(`[scheduler] No unsent cycles for Company ID ${companyId} — sending 0-record notification.`);
    const html = buildReportEmailHtml({
      rows: [], fromLabel: "", toLabel: "", total: 0, pass: 0, nr: 0,
      recipientCount: recipients.length,
    });
    try {
      const transporter = await createTransporter(companyId);
      await transporter.sendMail({
        from:    `${smtp.from_name} <${smtp.user}>`,
        to:      recipients.join(", "),
        subject: `ToteTrack Cycle Report — 0 cycles | Scheduled`,
        html,
      });
      await safeLog({
        record_count: 0,
        status:       "success",
        action:       "Scheduled Report (0 cycles)",
        recipients:   recipients.join(", "),
      }, companyId);
      logger.info(`[scheduler] 0-record notification sent`);
    } catch (err) {
      await safeLog({
        record_count:  0,
        status:        "failed",
        error_message: err.message,
        action:        "Scheduled Report (0 cycles)",
        recipients:    recipients.join(", "),
      }, companyId);
      logger.error(`[scheduler] 0-record notification failed: ${err.message}`);
    }
    return { success: true, count: 0 };
  }

  // ── Split into batches of BATCH_SIZE ──────────────────────────────────────
  const batches = [];
  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    batches.push(allRows.slice(i, i + BATCH_SIZE));
  }

  const totalBatches = batches.length;
  logger.info(`[scheduler] ${allRows.length} unsent cycles → ${totalBatches} batch(es) of up to ${BATCH_SIZE}`);

  let totalSent  = 0;
  let totalPass  = 0;
  let totalNr    = 0;
  let failedBatches = 0;

  for (let i = 0; i < batches.length; i++) {
    const result = await sendBatch({
      batch:        batches[i],
      batchNum:     i + 1,
      totalBatches,
      smtp,
      recipients,
      companyId,
    });

    if (result.success) {
      totalSent += result.count;
      totalPass += result.pass;
      totalNr   += result.nr;
    } else {
      failedBatches++;
      // Continue sending remaining batches even if one fails
      logger.warn(`[scheduler] Batch ${i + 1} failed — continuing with remaining batches`);
    }
  }

  logger.info(`[scheduler] Job complete — sent: ${totalSent}, failed batches: ${failedBatches}/${totalBatches}`);
  return {
    success:       failedBatches < totalBatches,
    count:         totalSent,
    pass:          totalPass,
    nr:            totalNr,
    totalBatches,
    failedBatches,
  };
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

  // ── Data ──────────────────────────────────────────────────────────────────
  const rows  = await getReportData({ fromDt, toDt, status, zoneId });
  const total = rows.length;
  const pass  = rows.filter(r => r.status === "PASS").length;
  const nr    = rows.filter(r => r.status === "NR").length;

  if (!total) {
    logger.info("[report-email] 0 records found — sending empty report notification.");
  } else {
    logger.info(`[report-email] ${total} records (PASS:${pass} NR:${nr})`);
  }

  // ── Build ZIP (skip for 0 records) ────────────────────────────────────────
  let attachments = [];
  if (total > 0) {
    try {
      const zipBuffer = await buildReportZip(rows);
      logger.info(`[report-email] ZIP built: ${zipBuffer.length} bytes`);
      const pad = (n) => String(n).padStart(2, "0");
      const d   = new Date();
      const ts  = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
      attachments = [{ filename: `TCP_Report_${ts}.zip`, content: zipBuffer, contentType: "application/zip" }];
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
  }

  // ── Build HTML ────────────────────────────────────────────────────────────
  const html = buildReportEmailHtml({
    rows,
    fromLabel: fromLabel || fromDt,
    toLabel:   toLabel   || toDt,
    total, pass, nr,
    recipientCount: recipients.length,
  });

  // ── Send — transporter created right before send ──────────────────────────
  try {
    const transporter = await createTransporter(companyId);
    await transporter.sendMail({
      from:    `${smtp.from_name} <${smtp.user}>`,
      to:      recipients.join(", "),
      subject: `ToteTrack Cycle Report — ${total} cycles (PASS: ${pass} / NR: ${nr}) | ${fromLabel || fromDt}`,
      html,
      attachments,
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
