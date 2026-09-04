const fs   = require("fs");
const path = require("path");
const { createTransporter }                                      = require("../config/mailer");
const { getSmtpSettings, getActiveRecipients, createEmailLog }   = require("../models/email.model");
const { getRecordsByIds, getRecordsByFilter }                    = require("../models/message.model");
const { generateExcelBuffer, createImagesZip }                   = require("./excel.service");
const logger                                                     = require("../utils/logger");

/* ── HTML template for manual-send emails ─────────────────────────────────── */
function buildReportHtml({ records, totalCount, action }) {
  const preview = records.slice(0, 20);
  const hasMore = totalCount > 20;
  const now     = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

  const rows = preview.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? "#f8fafc" : "#ffffff"}">
      <td style="padding:7px 10px;border:1px solid #e2e8f0;font-size:12px">${r.id}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8f0;font-size:12px">${r.received_at ? new Date(r.received_at).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }) : ""}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8f0;font-size:12px;max-width:360px;word-break:break-word">${r.message}</td>
      <td style="padding:7px 10px;border:1px solid #e2e8f0;font-size:12px;max-width:280px;word-break:break-word">${r.barcode ? String(r.barcode).replace(/\|/g, " | ") : "—"}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f1f5f9">
  <div style="max-width:860px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
    <div style="background:#1e40af;padding:24px 32px">
      <h1 style="margin:0;color:#fff;font-size:20px">ToteTrack — Records Report</h1>
      <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px">Action: ${action}</p>
    </div>
    <div style="padding:24px 32px">
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="padding:12px 16px;background:#eff6ff;border-radius:8px;text-align:center">
            <div style="font-size:28px;font-weight:700;color:#1e40af">${totalCount.toLocaleString()}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px">Total Records</div>
          </td>
          <td style="padding:12px 16px;background:#f0fdf4;border-radius:8px;text-align:center;padding-left:12px">
            <div style="font-size:14px;font-weight:600;color:#166534">${now}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px">Generated At</div>
          </td>
        </tr>
      </table>

      <h3 style="font-size:14px;color:#374151;margin:0 0 12px">Record Preview (first 20)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#1e40af;color:#fff">
            <th style="padding:9px 10px;border:1px solid #e2e8f0;text-align:left">ID</th>
            <th style="padding:9px 10px;border:1px solid #e2e8f0;text-align:left">Received At</th>
            <th style="padding:9px 10px;border:1px solid #e2e8f0;text-align:left">Message</th>
            <th style="padding:9px 10px;border:1px solid #e2e8f0;text-align:left">Barcode</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      ${hasMore ? `<p style="margin-top:16px;padding:12px;background:#fef3c7;border-radius:6px;font-size:13px;color:#92400e">
        📎 Full data (${totalCount.toLocaleString()} records) is available in the attached Excel file.
      </p>` : ""}
    </div>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb;background:#ffffff;">
      <tr>
        <td style="padding:20px 32px;text-align:left;">
          <div style="font-size:16px;font-weight:bold;color:#1e293b;margin:0;font-family:Arial,sans-serif;">Pixcels<span style="color:#4f46e5;">Themes</span></div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;font-family:Arial,sans-serif;">Innovative IT &amp; Automation Solutions for Your Business</div>
        </td>
        <td style="padding:20px 32px;text-align:right;">
          <a href="https://www.pixcelsthemes.com/" style="display:inline-block;padding:8px 16px;background:#f8fafc;color:#4f46e5;text-decoration:none;font-size:13px;font-weight:bold;border:1px solid #e2e8f0;border-radius:6px;font-family:Arial,sans-serif;">Visit Website</a>
        </td>
      </tr>
    </table>
    <div style="background:#f8fafc;padding:14px 32px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;">
      Generated at ${now} · ToteTrack
    </div>
  </div>
</body>
</html>`;
}

/* ── Core send helper — groups records by zone, one email per zone ─────────── */
async function sendRecordsEmail({ records, action, companyId }) {
  const smtp = await getSmtpSettings(companyId);
  if (!smtp) return { skipped: true, reason: "SMTP settings not configured" };

  const recipients = await getActiveRecipients(companyId);
  if (!recipients.length) return { skipped: true, reason: "No active recipients" };

  // ── Group by zone_id ────────────────────────────────────────────────────────
  const groups = {};
  for (const r of records) {
    const key = r.zone_id != null ? String(r.zone_id) : "unassigned";
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }

  const results = [];

  for (const [zoneKey, zoneRecords] of Object.entries(groups)) {
    const zoneLabel  = zoneKey === "unassigned" ? action : `${action} (Zone ${zoneKey})`;
    const dateFrom   = zoneRecords.length ? new Date(zoneRecords[zoneRecords.length - 1].received_at).toISOString().split("T")[0] : null;
    const dateTo     = zoneRecords.length ? new Date(zoneRecords[0].received_at).toISOString().split("T")[0] : null;

    const html        = buildReportHtml({ records: zoneRecords, totalCount: zoneRecords.length, action: zoneLabel });
    const attachments = [];

    // Excel
    try {
      const { buffer, fileName } = await generateExcelBuffer(zoneRecords);
      attachments.push({ filename: fileName, content: buffer, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    } catch (excelErr) {
      logger.error(`[${zoneLabel}] Excel failed: ${excelErr.message}`);
    }

    // Images ZIP (per-record folder_path is already correct from tcp_messages insert)
    try {
      const zipBuffer = await createImagesZip(zoneRecords);
      if (zipBuffer.length > 0) {
        attachments.push({
          filename:    `Records_Images_${zoneKey}_${dateFrom}.zip`,
          content:     zipBuffer,
          contentType: "application/zip",
        });
        logger.info(`[${zoneLabel}] Created ZIP for ${zoneRecords.length} records`);
      } else {
        logger.warn(`[${zoneLabel}] No images found to ZIP`);
      }
    } catch (zipErr) {
      logger.error(`[${zoneLabel}] ZIP failed: ${zipErr.message}`);
    }

    try {
      const transporter = await createTransporter(companyId);
      await transporter.sendMail({
        from:        `${smtp.from_name} <${smtp.user}>`,
        to:          recipients.join(", "),
        subject:     `ToteTrack — ${zoneRecords.length.toLocaleString()} records · ${zoneLabel}`,
        html,
        attachments,
      });

      try {
        await createEmailLog({
          record_count: zoneRecords.length,
          status:       "success",
          date_from:    dateFrom,
          date_to:      dateTo,
          action:       zoneLabel,
          recipients:   recipients.join(", "),
        }, companyId);
      } catch (logErr) {
        logger.error(`[${zoneLabel}] Log write failed (success): ${logErr.message}`);
      }

      logger.info(`[${zoneLabel}] Email sent: ${zoneRecords.length} records → ${recipients.join(", ")}`);
      results.push({ success: true, count: zoneRecords.length, recipients, zone: zoneKey });
    } catch (err) {
      try {
        await createEmailLog({
          record_count:  zoneRecords.length,
          status:        "failed",
          error_message: err.message,
          date_from:     dateFrom,
          date_to:       dateTo,
          action:        zoneLabel,
          recipients:    recipients.join(", "),
        }, companyId);
      } catch (logErr) {
        logger.error(`[${zoneLabel}] Log write failed (failed): ${logErr.message}`);
      }
      logger.error(`[${zoneLabel}] Email failed for Company ID ${companyId}: ${err.message}`);
      results.push({ success: false, error: err.message, zone: zoneKey });
    }
  }

  const totalSent  = results.filter(r => r.success).reduce((acc, r) => acc + (r.count || 0), 0);
  const firstError = results.find(r => !r.success)?.error;

  if (totalSent === 0 && firstError) {
    return { success: false, error: firstError, results };
  }

  return { success: true, count: totalSent, results };
}

/* ── Public API ────────────────────────────────────────────────────────────── */
async function sendSelectedRecords(ids, companyId, isSuperAdmin) {
  const records = await getRecordsByIds(ids, companyId, isSuperAdmin);
  if (!records.length) return { skipped: true, reason: "No records found for given IDs" };
  return sendRecordsEmail({ records, action: "Selected Records Send", companyId });
}

async function sendFilteredRecords({ emailStatus, timeRange, search }, companyId, isSuperAdmin) {
  const records = await getRecordsByFilter({ emailStatus, timeRange, search }, companyId, isSuperAdmin);
  if (!records.length) return { skipped: true, reason: "No records match the filter" };
  return sendRecordsEmail({ records, action: "Filtered Send", companyId });
}

module.exports = { sendSelectedRecords, sendFilteredRecords };
