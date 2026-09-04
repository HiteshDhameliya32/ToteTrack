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
    const { from, to, status = "all" } = req.query;

    if (!from || !to) {
      return res.status(400).json({ success: false, message: "from and to query params are required" });
    }

    // Convert datetime-local strings to MySQL-compatible datetime
    // Input: "2026-09-01T08:00"  →  "2026-09-01 08:00:00"
    const fromDt = from.replace("T", " ") + ":00";
    const toDt   = to.replace("T", " ")   + ":59"; // include the last minute fully

    logger.info(`[report] Download request: from=${fromDt} to=${toDt} status=${status}`);

    const rows = await getReportData({ fromDt, toDt, status });

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "No records found for the selected date range" });
    }

    const d   = new Date();
    const ts  = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    const zipName = `TCP_Report_${ts}.zip`;

    const zipBuf = await buildReportZip(rows);

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
    const { from, to, status = "all" } = req.query;

    if (!from || !to) {
      return res.status(400).json({ success: false, message: "from and to query params are required" });
    }

    const fromDt = from.replace("T", " ") + ":00";
    const toDt   = to.replace("T", " ")   + ":59";

    const rows = await getReportData({ fromDt, toDt, status });

    const total = rows.length;
    const pass  = rows.filter(r => r.status === "PASS").length;
    const nr    = rows.filter(r => r.status === "NR").length;

    res.json({ success: true, records: rows, total, pass, nr });
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
  const { from, to, status = "all" } = req.body;

  if (!from || !to) {
    return res.status(400).json({ success: false, message: "from and to are required" });
  }

  const fromDt    = from.replace("T", " ") + ":00";
  const toDt      = to.replace("T", " ")   + ":59";
  const fmtLabel  = (s) => s.replace("T", " ");
  const companyId = req.user?.company_id || 1;
  const userEmail = req.user?.email || "unknown";

  logger.info(`[report-email] Queued by ${userEmail}: from=${fromDt} to=${toDt} status=${status}`);

  // ── Reply immediately — don't await the background work ──────────────────
  res.status(202).json({
    success: true,
    message: "Report is being prepared. You will receive the email in a few minutes.",
  });

  // ── Background processing — runs after response is already sent ──────────
  setImmediate(async () => {
    try {
      const result = await sendReportEmail({
        fromDt,
        toDt,
        status,
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
