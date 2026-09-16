const { getReportData } = require("../models/message.model");
const { buildReportZip } = require("../services/excel.service");
const { sendReportEmail } = require("../services/email.service");
const logger = require("../utils/logger");

function pad(n) { return String(n).padStart(2, "0"); }

/**
 * GET /reports/download?from=YYYY-MM-DDTHH:mm&to=YYYY-MM-DDTHH:mm&status=all|PASS|NR
 *
 * Streams a ZIP containing:
 *   report.xlsx   — all cycles in range
 *   images/       — NR-cycle images only
 */
const download = async (req, res, next) => {
  try {
    const { from, to, status = "all", zoneId = null } = req.query;

    if (!from || !to) {
      return res.status(400).json({ success: false, message: "from and to query params are required" });
    }

    const fromDt = from.replace("T", " ") + ":00";
    const toDt   = to.replace("T", " ")   + ":59";

    logger.info(`[report] Download request: from=${fromDt} to=${toDt} status=${status} zoneId=${zoneId || "all"}`);

    const rows = await getReportData({ fromDt, toDt, status, zoneId });

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "No records found for the selected date range" });
    }

    // Meaningful filename: ToteTrack_Report_20260916_0900_to_20260916_1700.zip
    function labelToSlug(lbl) { return lbl.replace(/[-: T]/g, "").slice(0, 12); }
    const fromSlug = labelToSlug(fromDt);
    const toSlug   = labelToSlug(toDt);
    const zipName  = `ToteTrack_Report_${fromSlug}_to_${toSlug}.zip`;

    const fromLabel = fromDt.slice(0, 16);
    const toLabel   = toDt.slice(0, 16);
    const zipBuf = await buildReportZip(rows, { fromLabel, toLabel });

    res.setHeader("Content-Type",        "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);
    res.setHeader("Content-Length",      zipBuf.length);
    res.end(zipBuf);

    logger.info(`[report] Sent ${zipName} (${zipBuf.length} bytes, ${rows.length} records)`);
  } catch (err) {
    logger.error(`[report] Download error: ${err.message}`);
    next(err);
  }
};

/**
 * GET /reports/preview?from=...&to=...&status=...
 * Returns JSON summary for the frontend table (no ZIP).
 */
const preview = async (req, res, next) => {
  try {
    const { from, to, status = "all", zoneId = null, emailSent = "all" } = req.query;

    if (!from || !to) {
      return res.status(400).json({ success: false, message: "from and to query params are required" });
    }

    const fromDt = from.replace("T", " ") + ":00";
    const toDt   = to.replace("T", " ")   + ":59";

    const rows = await getReportData({ fromDt, toDt, status, zoneId, emailSent });

    const total   = rows.length;
    const pass    = rows.filter(r => r.status === "PASS").length;
    const nr      = rows.filter(r => r.status === "NR").length;
    const sent    = rows.filter(r => r.email_sent == 1).length;
    const pending = rows.filter(r => r.email_sent == 0).length;

    res.json({ success: true, records: rows, total, pass, nr, sent, pending });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /reports/email
 * Body: { from, to, status }
 *
 * Returns 202 IMMEDIATELY — the ZIP build + email send happens in the
 * background so the HTTP connection is never held open.
 * The scanning process and the user are completely unaffected.
 */
const sendEmail = async (req, res) => {
  const { from, to, status = "all", zoneId = null } = req.body;

  if (!from || !to) {
    return res.status(400).json({ success: false, message: "from and to are required" });
  }

  const fromDt    = from.replace("T", " ") + ":00";
  const toDt      = to.replace("T", " ")   + ":59";
  const fmtLabel  = (s) => s.replace("T", " ");
  const companyId = req.user?.company_id || 1;
  const userEmail = req.user?.email || "unknown";

  logger.info(`[report-email] Queued by ${userEmail}: from=${fromDt} to=${toDt} status=${status} zoneId=${zoneId || "all"}`);

  res.status(202).json({
    success: true,
    message: "Report is being prepared. You will receive the email in a few minutes.",
  });

  setImmediate(async () => {
    try {
      const result = await sendReportEmail({
        fromDt,
        toDt,
        status,
        zoneId,
        fromLabel:  fmtLabel(from),
        toLabel:    fmtLabel(to),
        companyId,
      });

      if (result.skipped) {
        logger.warn(`[report-email] Skipped (${result.reason}) — requested by ${userEmail}`);
      } else {
        logger.info(`[report-email] Done — ${result.count} records sent to ${result.recipients} recipient(s) — requested by ${userEmail}`);
      }
    } catch (err) {
      logger.error(`[report-email] Background job failed: ${err.message}`);
    }
  });
};

module.exports = { download, preview, sendEmail };
