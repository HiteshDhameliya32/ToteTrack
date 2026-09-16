const ExcelJS  = require("exceljs");
const fs        = require("fs");
const path      = require("path");
const archiver  = require("archiver");
const logger    = require("../utils/logger");

/* ─── helpers ────────────────────────────────────────────── */
function pad(n) { return String(n).padStart(2, "0"); }
function pad4(d) {
  // Returns "YYYYMMDD_HHmm" for now
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function getFileName() {
  const d = new Date();
  return `TCP_Records_${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.xlsx`;
}

function toIST(dt) {
  if (!dt) return "";
  return new Date(dt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
}

/* ─── existing scheduler-email Excel (unchanged API) ────── */
async function generateExcelBuffer(records) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ToteTrack";
  wb.created = new Date();

  const ws = wb.addWorksheet("ToteTrack Records");
  ws.columns = [
    { header: "ID",          key: "id",          width: 12 },
    { header: "Received At", key: "received_at", width: 22 },
    { header: "Message",     key: "message",     width: 60 },
    { header: "Barcode",     key: "barcode",     width: 40 },
  ];

  ws.getRow(1).eachCell((cell) => {
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
    cell.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.border    = { top:{style:"thin"}, bottom:{style:"thin"}, left:{style:"thin"}, right:{style:"thin"} };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  const barcodeRecords = records.filter(r => r.barcode && String(r.barcode).trim() !== "");
  const CHUNK = 500;
  for (let i = 0; i < barcodeRecords.length; i += CHUNK) {
    barcodeRecords.slice(i, i + CHUNK).forEach((r, idx) => {
      const row = ws.addRow({
        id:          r.id,
        received_at: r.received_at ? new Date(r.received_at).toLocaleString("en-US", { timeZone: "Asia/Kolkata" }) : "",
        message:     r.message,
        barcode:     r.barcode ? String(r.barcode).replace(/\|/g, " | ") : "",
      });
      if ((i + idx) % 2 === 1) {
        row.eachCell(cell => { cell.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFF1F5F9" } }; });
      }
      row.eachCell(cell => {
        cell.border = { top:{style:"thin",color:{argb:"FFE2E8F0"}}, bottom:{style:"thin",color:{argb:"FFE2E8F0"}},
                        left:{style:"thin",color:{argb:"FFE2E8F0"}}, right:{style:"thin",color:{argb:"FFE2E8F0"}} };
      });
    });
  }

  ws.getRow(1).height = 20;
  ws.autoFilter = { from: "A1", to: "D1" };
  const buffer = await wb.xlsx.writeBuffer();
  return { buffer, fileName: getFileName() };
}

/* ─── existing scheduler-email ZIP (unchanged API) ──────── */
async function createImagesZip(records) {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 } });
    const parts   = [];
    let totalLen  = 0;

    archive.on("data",  chunk => { parts.push(chunk); totalLen += chunk.length; });
    archive.on("error", reject);
    archive.on("end", () => {
      try {
        const result = Buffer.allocUnsafe(totalLen);
        let offset = 0;
        for (const part of parts) { part.copy(result, offset); offset += part.length; }
        resolve(result);
      } catch (err) { reject(err); }
    });

    records.forEach(record => {
      if (record.barcode && String(record.barcode).trim() !== "") return; // skip PASS
      if (!record.image) return;

      let imagePath = record.image;
      if (!path.isAbsolute(imagePath) && record.folder_path)
        imagePath = path.join(record.folder_path, record.image);

      if (fs.existsSync(imagePath)) {
        archive.file(imagePath, { name: `Record_${record.id}_${path.basename(imagePath)}` });
      } else {
        logger.warn(`Image file not found: ${imagePath}`);
      }
    });

    archive.finalize();
  });
}

/**
 * Build the report ZIP containing:
 *   report.xlsx  — one sheet per zone, each with full cycle data
 *   images/      — NR cycle images only
 */

/**
 * Resolve the absolute path of a cycle's image file on disk.
 * image_name may be stored without extension — scan folder for a match.
 * Returns null (never throws) if not found.
 */
function resolveImagePath(row) {
  try {
    const { image_name, folder_path } = row;
    if (!image_name || !folder_path) return null;

    const folder = String(folder_path).trim().replace(/^["']|["']$/g, "");
    if (!fs.existsSync(folder)) return null;

    const identName = path.parse(image_name).name.toLowerCase();
    const files     = fs.readdirSync(folder);
    const match     = files.find(f =>
      path.parse(f).name.toLowerCase() === identName ||
      f.toLowerCase() === image_name.toLowerCase()
    );
    return match ? path.join(folder, match) : null;
  } catch {
    return null;
  }
}

async function buildReportZip(rows, { fromLabel = "", toLabel = "" } = {}) {
  // Pre-resolve image paths for NR rows — never throws
  rows.forEach(r => {
    if (r.status === "NR") {
      const imgPath = resolveImagePath(r);
      r.resolvedImageName = imgPath ? path.basename(imgPath) : null;
      r.resolvedImagePath = imgPath || null;
      r.imageNotFound     = !imgPath && !!r.image_name; // flag for Excel note
    } else {
      r.resolvedImageName = null;
      r.resolvedImagePath = null;
      r.imageNotFound     = false;
    }
  });

  const excelBuf = await buildReportExcel(rows);

  // Build a meaningful filename from the date range
  // e.g. "ToteTrack_Report_20260916_0900_to_20260916_1700.xlsx"
  function labelToSlug(lbl) {
    return lbl.replace(/[-: ]/g, "").replace("T", "_").slice(0, 13); // "20260916_0900"
  }
  const fromSlug   = fromLabel ? labelToSlug(fromLabel) : pad4(new Date());
  const toSlug     = toLabel   ? labelToSlug(toLabel)   : fromSlug;
  const excelName  = `ToteTrack_Report_${fromSlug}_to_${toSlug}.xlsx`;

  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 } });

    // Collect into a single growing buffer using pre-allocated chunks
    // Avoids the V8 "cannot create string longer than 0x1fffff0e8" error
    // that occurs when Buffer.concat is called on thousands of tiny chunks
    const parts = [];
    let totalLen = 0;

    archive.on("data", (chunk) => {
      parts.push(chunk);
      totalLen += chunk.length;
    });

    archive.on("error", (err) => {
      reject(err);
    });

    archive.on("end", () => {
      try {
        // Allocate one buffer of the exact final size and copy all chunks into it
        const result = Buffer.allocUnsafe(totalLen);
        let offset = 0;
        for (const part of parts) {
          part.copy(result, offset);
          offset += part.length;
        }
        resolve(result);
      } catch (concatErr) {
        reject(concatErr);
      }
    });

    archive.append(Buffer.from(excelBuf), { name: excelName });

    let imagesAdded = 0;
    rows.filter(r => r.status === "NR").forEach(r => {
      if (r.resolvedImagePath && fs.existsSync(r.resolvedImagePath)) {
        archive.file(r.resolvedImagePath, { name: `images/${r.resolvedImageName}` });
        imagesAdded++;
      } else if (r.image_name) {
        logger.warn(`[report] NR image not found for cycle ${r.cycle_id} — image_name="${r.image_name}" folder="${r.folder_path}"`);
      }
    });

    logger.info(`[report] ZIP: ${rows.length} records, ${imagesAdded} NR images`);
    archive.finalize();
  });
}

/**
 * Build report Excel with one sheet per zone.
 * Sheet name = zone name (e.g. "Zone1", "Zone2").
 * Each sheet has columns: #, Scan Time, Status, Barcode(s), Image File
 */
async function buildReportExcel(rows) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ToteTrack";
  wb.created = new Date();

  // Group rows by zone_name
  const zoneMap = new Map();
  for (const r of rows) {
    const zoneName = r.zone_name || `Zone ${r.zone_id}`;
    if (!zoneMap.has(zoneName)) zoneMap.set(zoneName, []);
    zoneMap.get(zoneName).push(r);
  }

  // If no rows at all, create one empty sheet so the file is valid
  if (zoneMap.size === 0) {
    const ws = wb.addWorksheet("No Data");
    ws.addRow(["No records found for this period."]);
    return wb.xlsx.writeBuffer();
  }

  const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
  const passFill   = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } };
  const nrFill     = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
  const altFill    = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };

  for (const [zoneName, zoneRows] of zoneMap) {
    // Excel sheet names max 31 chars, no special chars
    const sheetName = zoneName.slice(0, 31).replace(/[\\/*?:[\]]/g, "_");
    const ws = wb.addWorksheet(sheetName);

    ws.columns = [
      { header: "#",          key: "num",        width: 6  },
      { header: "Scan Time",  key: "started_at", width: 22 },
      { header: "Status",     key: "status",     width: 10 },
      { header: "Barcode(s)", key: "barcode",    width: 40 },
      { header: "Image File", key: "image_name", width: 24 },
    ];

    // Header style
    ws.getRow(1).eachCell(cell => {
      cell.fill      = headerFill;
      cell.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.border    = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    ws.getRow(1).height = 22;

    zoneRows.forEach((r, idx) => {
      const row = ws.addRow({
        num:        idx + 1,
        started_at: toIST(r.started_at),
        status:     r.status,
        barcode:    r.barcode ? String(r.barcode).replace(/\|/g, " | ") : "—",
        image_name: r.status === "NR"
          ? (r.resolvedImageName
              ? r.resolvedImageName
              : r.image_name
                ? `${r.image_name} (not found)`
                : "—")
          : "—",
      });

      const rowFill = r.status === "PASS" ? passFill : r.status === "NR" ? nrFill : (idx % 2 === 1 ? altFill : null);
      if (rowFill) row.eachCell(cell => { cell.fill = rowFill; });

      const statusCell = row.getCell("status");
      statusCell.font = { bold: true, color: { argb: r.status === "PASS" ? "FF059669" : "FFDC2626" } };

      row.eachCell(cell => {
        cell.border    = { top: { style: "thin", color: { argb: "FFE2E8F0" } }, bottom: { style: "thin", color: { argb: "FFE2E8F0" } }, left: { style: "thin", color: { argb: "FFE2E8F0" } }, right: { style: "thin", color: { argb: "FFE2E8F0" } } };
        cell.alignment = { vertical: "middle" };
      });
    });

    // Summary row at bottom
    const zTotal = zoneRows.length;
    const zPass  = zoneRows.filter(r => r.status === "PASS").length;
    const zNr    = zoneRows.filter(r => r.status === "NR").length;
    ws.addRow([]);
    const sumRow = ws.addRow(["", "TOTAL", zTotal, `PASS: ${zPass}`, `NR: ${zNr}`]);
    sumRow.font = { bold: true };
    sumRow.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF6FF" } };

    ws.autoFilter = { from: "A1", to: "E1" };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  }

  return wb.xlsx.writeBuffer();
}

module.exports = { generateExcelBuffer, createImagesZip, buildReportZip };
