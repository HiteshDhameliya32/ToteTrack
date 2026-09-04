const ExcelJS  = require("exceljs");
const fs        = require("fs");
const path      = require("path");
const archiver  = require("archiver");
const logger    = require("../utils/logger");

/* ─── helpers ────────────────────────────────────────────── */
function pad(n) { return String(n).padStart(2, "0"); }

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
    const chunks  = [];
    archive.on("data",  chunk => chunks.push(chunk));
    archive.on("error", reject);
    archive.on("end",   () => resolve(Buffer.concat(chunks)));

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

/* ─── Report ZIP: Excel + NR images ─────────────────────── */

/**
 * Build the report Excel workbook from zone_cycle rows.
 * Columns: #, Zone, Started At, Status, Barcode(s), Image File
 * resolvedImageName: actual filename on disk (e.g. "1.jpg") pre-resolved per row
 */
async function buildReportExcel(rows) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ToteTrack";
  wb.created = new Date();

  const ws = wb.addWorksheet("Cycle Report");

  ws.columns = [
    { header: "#",           key: "num",        width: 6  },
    { header: "Zone",        key: "zone_id",    width: 10 },
    { header: "Scan Time",   key: "started_at", width: 22 },
    { header: "Status",      key: "status",     width: 10 },
    { header: "Barcode(s)",  key: "barcode",    width: 40 },
    { header: "Image File",  key: "image_name", width: 24 },
  ];

  // Header style
  const headerFill = { type:"pattern", pattern:"solid", fgColor:{ argb:"FF1E40AF" } };
  ws.getRow(1).eachCell(cell => {
    cell.fill      = headerFill;
    cell.font      = { bold:true, color:{ argb:"FFFFFFFF" }, size:11 };
    cell.border    = { top:{style:"thin"}, bottom:{style:"thin"}, left:{style:"thin"}, right:{style:"thin"} };
    cell.alignment = { vertical:"middle", horizontal:"center" };
  });
  ws.getRow(1).height = 22;

  // Status fill colours
  const passFill = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFD1FAE5" } }; // green-100
  const nrFill   = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFFEE2E2" } }; // red-100
  const altFill  = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFF8FAFC" } }; // slate-50

  rows.forEach((r, idx) => {
    const row = ws.addRow({
      num:        idx + 1,
      zone_id:    `Zone ${r.zone_id}`,
      started_at: toIST(r.started_at),
      status:     r.status,
      barcode:    r.barcode ? String(r.barcode).replace(/\|/g, " | ") : "—",
      // Use the resolved filename (with extension) so it matches what's in the ZIP
      image_name: r.status === "NR" && r.resolvedImageName ? r.resolvedImageName : "—",
    });

    // Row background
    const rowFill = r.status === "PASS" ? passFill : r.status === "NR" ? nrFill : (idx % 2 === 1 ? altFill : null);
    if (rowFill) row.eachCell(cell => { cell.fill = rowFill; });

    // Status cell bold + coloured
    const statusCell = row.getCell("status");
    statusCell.font = { bold: true, color: { argb: r.status === "PASS" ? "FF059669" : "FFDC2626" } };

    row.eachCell(cell => {
      cell.border = {
        top:{style:"thin",color:{argb:"FFE2E8F0"}}, bottom:{style:"thin",color:{argb:"FFE2E8F0"}},
        left:{style:"thin",color:{argb:"FFE2E8F0"}}, right:{style:"thin",color:{argb:"FFE2E8F0"}},
      };
      cell.alignment = { vertical:"middle" };
    });
  });

  // Summary row
  const total = rows.length;
  const pass  = rows.filter(r => r.status === "PASS").length;
  const nr    = rows.filter(r => r.status === "NR").length;

  ws.addRow([]);
  const sumRow = ws.addRow(["", "", "TOTAL", total, `PASS: ${pass}`, `NR: ${nr}`]);
  sumRow.font = { bold: true };
  sumRow.getCell(3).fill = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFEFF6FF" } };

  ws.autoFilter = { from:"A1", to:"F1" };
  ws.views = [{ state:"frozen", ySplit:1 }];

  return wb.xlsx.writeBuffer();
}

/**
 * Resolve absolute image path from a zone_cycle row.
 * image_name is stored without extension (e.g. "1").
 * We scan folder_path for a file whose basename matches.
 */
function resolveImagePath(row) {
  const { image_name, folder_path } = row;
  if (!image_name || !folder_path) return null;

  const folder = folder_path.trim().replace(/^["']|["']$/g, "");
  if (!fs.existsSync(folder)) return null;

  const identName = path.parse(image_name).name.toLowerCase();
  try {
    const files = fs.readdirSync(folder);
    const match = files.find(f => {
      return path.parse(f).name.toLowerCase() === identName ||
             f.toLowerCase() === image_name.toLowerCase();
    });
    return match ? path.join(folder, match) : null;
  } catch {
    return null;
  }
}

/**
 * Build a ZIP buffer containing:
 *   report.xlsx      — full cycle data for the date range
 *   images/          — NR cycle images only, named with the real filename (e.g. 1.jpg)
 *
 * The exact same filename used in the ZIP is written into the Excel "Image File" column.
 */
async function buildReportZip(rows) {
  // Pre-resolve actual image filenames for NR rows so Excel and ZIP stay in sync
  rows.forEach(r => {
    if (r.status === "NR") {
      const imgPath = resolveImagePath(r);
      r.resolvedImageName = imgPath ? path.basename(imgPath) : null;
      r.resolvedImagePath = imgPath || null;
    } else {
      r.resolvedImageName = null;
      r.resolvedImagePath = null;
    }
  });

  const excelBuf = await buildReportExcel(rows);

  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 6 } });
    const chunks  = [];
    archive.on("data",  c  => chunks.push(c));
    archive.on("error", reject);
    archive.on("end",   () => resolve(Buffer.concat(chunks)));

    // Add Excel
    archive.append(Buffer.from(excelBuf), { name: "report.xlsx" });

    // Add NR images — use exact resolved filename so it matches Excel
    let imagesAdded = 0;
    rows.filter(r => r.status === "NR").forEach(r => {
      if (r.resolvedImagePath && fs.existsSync(r.resolvedImagePath)) {
        // Name inside ZIP: images/<original filename> — same as shown in Excel
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

module.exports = { generateExcelBuffer, createImagesZip, buildReportZip };
