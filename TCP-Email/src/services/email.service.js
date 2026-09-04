const { createTransporter }                                    = require("../config/mailer");
const { getUnsentCycles, markCyclesSent, getReportData }       = require("../models/message.model");
const { getActiveRecipients, createEmailLog, getSmtpSettings } = require("../models/email.model");
const { buildReportEmailHtml }                                 = require("../utils/emailTemplate");
const { buildReportZip }                                       = require("./excel.service");
const logger                                                   = require("../utils/logger");

/**
 * Scheduled email report for a company.
 * Reads all unsent zone_cycles, sends one rich email with ZIP (Excel + NR images),
 * then marks those cycles as sent so they are never re-sent.
 */
async function sendEmailReport(companyId = 1) {
  logger.info(`[scheduler] Email job triggered for Company ID ${companyId}`);

  const recipients = await getActiveRecipients(companyId);
  if (!recipients.length) {
    logger.warn(`[scheduler] No active recipients for Company ID ${companyId}, skipping.`);
    return { skipped: true, reason: "No active recipients" };
  }

  const smtp = await getSmtpSettings(companyId);
  if (!smtp) {
    logger.warn(`[scheduler] SMTP not configured for Company ID ${companyId}, skipping.`);
    return { skipped: true, reason: "SMTP settings not configured" };
  }

  const rows = await getUnsentCycles(companyId);
  if (!rows.length) {
    logger.info(`[scheduler] No unsent cycles for Company ID ${companyId}, skipping.`);
    return { skipped: true, reason: "No unsent cycles" };
  }

  const total = rows.length;
  const pass  = rows.filter(r => r.status === "PASS").length;
  const nr    = rows.filter(r => r.status === "NR").length;

  // Determine date range label from the cycles
  const dates    = rows.map(r => r.started_at).sort();
  const fromLabel = dates[0]?.slice(0, 16).replace("T", " ") || "";
  const toLabel   = dates[dates.length - 1]?.slice(0, 16).replace("T", " ") || "";

  logger.info(`[scheduler] Sending ${total} cycles (PASS:${pass} NR:${nr}) from ${fromLabel} → ${toLabel}`);

  // Build ZIP in memory — resolves image names onto rows as a side-effect
  let zipBuffer;
  try {
    zipBuffer = await buildReportZip(rows);
    logger.info(`[scheduler] ZIP built: ${zipBuffer.length} bytes`);
  } catch (zipErr) {
    logger.error(`[scheduler] ZIP build failed: ${zipErr.message}`);
    return { success: false, error: zipErr.message };
  }

  // Build HTML using the same rich template as the manual report
  const html = buildReportEmailHtml({
    rows,
    fromLabel,
    toLabel,
    total,
    pass,
    nr,
    recipientCount: recipients.length,
  });

  const pad = (n) => String(n).padStart(2, "0");
  const d   = new Date();
  const ts  = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;

  try {
    const transporter = await createTransporter(companyId);
    await transporter.sendMail({
      from:    `${smtp.from_name} <${smtp.user}>`,
      to:      recipients.join(", "),
      subject: `ToteTrack Cycle Report — ${total} cycles (PASS: ${pass} / NR: ${nr}) | ${fromLabel}`,
      html,
      attachments: [{
        filename:    `TCP_Report_${ts}.zip`,
        content:     zipBuffer,
        contentType: "application/zip",
      }],
    });

    // Mark all sent cycles so they won't be included in the next run
    const ids = rows.map(r => r.id);
    await markCyclesSent(ids);

    await createEmailLog({
      record_count: total,
      status:       "success",
      date_from:    fromLabel,
      date_to:      toLabel,
      action:       `Scheduled Report (PASS: ${pass} / NR: ${nr})`,
      recipients:   recipients.join(", "),
    }, companyId);

    logger.info(`[scheduler] Email sent — ${total} cycles marked as sent`);
    return { success: true, count: total, pass, nr };

  } catch (err) {
    await createEmailLog({
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

/**
 * Send a manual date-range report email to all active recipients.
 * Attaches a ZIP (report.xlsx + NR images).
 *
 * @param {object} opts
 * @param {string} opts.fromDt   - "YYYY-MM-DD HH:mm:ss"
 * @param {string} opts.toDt     - "YYYY-MM-DD HH:mm:ss"
 * @param {string} opts.status   - "all" | "PASS" | "NR"
 * @param {string} opts.fromLabel - display string for email header
 * @param {string} opts.toLabel   - display string for email header
 * @param {number} opts.companyId
 */
async function sendReportEmail({ fromDt, toDt, status = "all", fromLabel, toLabel, companyId = 1 }) {
  logger.info(`[report-email] Triggered: from=${fromDt} to=${toDt} status=${status} company=${companyId}`);

  // ── Recipients ───────────────────────────────────────────────────────────
  const recipients = await getActiveRecipients(companyId);
  if (!recipients.length) {
    logger.warn("[report-email] No active recipients, skipping.");
    return { skipped: true, reason: "No active recipients configured" };
  }

  // ── SMTP ─────────────────────────────────────────────────────────────────
  const smtp = await getSmtpSettings(companyId);
  if (!smtp) {
    logger.warn("[report-email] SMTP not configured, skipping.");
    return { skipped: true, reason: "SMTP settings not configured" };
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  const rows = await getReportData({ fromDt, toDt, status });
  if (!rows.length) {
    return { skipped: true, reason: "No records found for the selected date range" };
  }

  const total   = rows.length;
  const pass    = rows.filter(r => r.status === "PASS").length;
  const nr      = rows.filter(r => r.status === "NR").length;

  // ── Build ZIP (also resolves image names onto each row for HTML table) ───
  let zipBuffer;
  try {
    zipBuffer = await buildReportZip(rows);
    logger.info(`[report-email] ZIP built: ${zipBuffer.length} bytes`);
  } catch (zipErr) {
    logger.error(`[report-email] ZIP build failed: ${zipErr.message}`);
    throw zipErr;
  }

  // ── Build HTML (rows already have resolvedImageName from buildReportZip) ─
  const html = buildReportEmailHtml({
    rows,
    fromLabel: fromLabel || fromDt,
    toLabel:   toLabel   || toDt,
    total,
    pass,
    nr,
    recipientCount: recipients.length,
  });

  // ── Timestamp for filename ───────────────────────────────────────────────
  const pad = (n) => String(n).padStart(2, "0");
  const d   = new Date();
  const ts  = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;

  // ── Send ─────────────────────────────────────────────────────────────────
  try {
    const transporter = await createTransporter(companyId);
    await transporter.sendMail({
      from:    `${smtp.from_name} <${smtp.user}>`,
      to:      recipients.join(", "),
      subject: `ToteTrack Cycle Report — ${total} cycles (PASS: ${pass} / NR: ${nr}) | ${fromLabel || fromDt}`,
      html,
      attachments: [
        {
          filename:    `TCP_Report_${ts}.zip`,
          content:     zipBuffer,
          contentType: "application/zip",
        },
      ],
    });

    // Log success
    await createEmailLog({
      record_count: total,
      status:       "success",
      date_from:    fromDt,
      date_to:      toDt,
      action:       `Manual Report (${status === "all" ? "All" : status}) ${fromLabel || fromDt} → ${toLabel || toDt}`,
      recipients:   recipients.join(", "),
    }, companyId);

    logger.info(`[report-email] Sent to ${recipients.join(", ")} — ${total} records`);
    return { success: true, count: total, pass, nr, recipients: recipients.length };

  } catch (err) {
    await createEmailLog({
      record_count:  total,
      status:        "failed",
      error_message: err.message,
      date_from:     fromDt,
      date_to:       toDt,
      action:        `Manual Report (${status === "all" ? "All" : status})`,
      recipients:    recipients.join(", "),
    }, companyId);

    logger.error(`[report-email] Send failed: ${err.message}`);
    throw err;
  }
}
