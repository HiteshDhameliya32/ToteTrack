/**
 * seed-dummy-data.js — Insert realistic dummy zone_cycles into tcp_logs.db
 *
 * Usage:
 *   node scripts/seed-dummy-data.js             → 200 cycles, last 7 days
 *   node scripts/seed-dummy-data.js --count 500 → 500 cycles
 *   node scripts/seed-dummy-data.js --days 30   → spread over last 30 days
 *   node scripts/seed-dummy-data.js --clear      → delete all existing zone_cycles first
 *   node scripts/seed-dummy-data.js --count 1000 --days 14 --clear
 *
 * Generates:
 *   - Cycles for Zone1 (id=17) and Zone2 (id=18)
 *   - ~80% PASS, ~20% NR  (configurable via PASS_RATE below)
 *   - Realistic barcodes (alphanumeric, 8–16 chars)
 *   - started_at spread across working hours (08:00–20:00) over --days days
 *   - completed_at = started_at + 1–5 seconds
 *   - email_sent = 0 (unsent, ready for scheduler to pick up)
 * 
 * # Default — 200 cycles, last 7 days
npm run db:seed

# Custom count and date range
node scripts/seed-dummy-data.js --count 500 --days 30

# Clear all existing data first, then seed fresh
node scripts/seed-dummy-data.js --count 1000 --days 14 --clear

# Quick test — 50 cycles
node scripts/seed-dummy-data.js --count 50 --days 3

 * 
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const path      = require("path");
const fs        = require("fs");
const crypto    = require("crypto");
const initSqlJs = require("sql.js");

const DB_PATH = path.resolve(__dirname, "../tcp_logs.db");

// ── Config ─────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const getArg    = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };
const hasFlag   = (flag) => args.includes(flag);

const COUNT     = parseInt(getArg("--count")  || "200", 10);
const DAYS      = parseInt(getArg("--days")   || "7",   10);
const CLEAR     = hasFlag("--clear");
const PASS_RATE = 0.80; // 80% PASS

// Zones from actual DB
const ZONES = [
  { id: 17, name: "Zone1", devices: ["169.254.42.102:2002", "169.254.4.102:2002"] },
  { id: 18, name: "Zone2", devices: ["169.254.5.224:2002",  "169.254.23.102:2002"] },
];

// ── Helpers ────────────────────────────────────────────────────────────────
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomBarcode() {
  const len  = randomInt(8, 16);
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < len; i++) code += chars[randomInt(0, chars.length - 1)];
  return code;
}

function toISTStr(date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const p   = formatter.formatToParts(date);
  const g   = (type) => p.find(x => x.type === type).value;
  return `${g("year")}-${g("month")}-${g("day")} ${g("hour")}:${g("minute")}:${g("second")}`;
}

function randomTimestamp(daysBack) {
  // Random time within working hours (08:00–20:00) daysBack days ago
  const now        = Date.now();
  const msBack     = randomInt(0, daysBack * 24 * 60 * 60 * 1000);
  const base       = new Date(now - msBack);

  // Set hour to working hours in IST
  const hour   = randomInt(8, 19);
  const minute = randomInt(0, 59);
  const second = randomInt(0, 59);

  // Get IST date parts
  const istStr = toISTStr(base);
  const dateStr = istStr.slice(0, 10); // YYYY-MM-DD

  return `${dateStr} ${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:${String(second).padStart(2,"0")}`;
}

function addSeconds(istStr, seconds) {
  // istStr: "YYYY-MM-DD HH:mm:ss"
  const d = new Date(istStr.replace(" ", "T") + "+05:30");
  d.setSeconds(d.getSeconds() + seconds);
  return toISTStr(d);
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("==========================================================");
  console.log(" ToteTrack — Seed Dummy Data");
  console.log(`  Count    : ${COUNT} cycles`);
  console.log(`  Days     : last ${DAYS} days`);
  console.log(`  Pass rate: ${PASS_RATE * 100}%`);
  console.log(`  Clear    : ${CLEAR}`);
  console.log(`  DB path  : ${DB_PATH}`);
  console.log("==========================================================\n");

  const SQL = await initSqlJs();
  const buf = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  if (!buf) {
    console.error("❌  tcp_logs.db not found. Run setup.bat first.");
    process.exit(1);
  }

  const db = new SQL.Database(buf);
  db.run("PRAGMA foreign_keys = ON;");

  // ── Optionally clear existing data ───────────────────────────────────────
  if (CLEAR) {
    db.run("DELETE FROM zone_cycles");
    const deleted = db.getRowsModified();
    console.log(`🗑️   Cleared ${deleted} existing zone_cycles rows\n`);
  }

  // ── Count before ─────────────────────────────────────────────────────────
  const [[{ before }]] = db.exec("SELECT COUNT(*) as before FROM zone_cycles").map(r => r.values.map(v => ({ before: v[0] })));

  // ── Generate and insert cycles ────────────────────────────────────────────
  console.log(`📝  Inserting ${COUNT} cycles...\n`);

  let inserted = 0;
  let skipped  = 0;

  for (let i = 0; i < COUNT; i++) {
    const zone       = randomChoice(ZONES);
    const isPass     = Math.random() < PASS_RATE;
    const status     = isPass ? "PASS" : "NR";
    const cycleId    = crypto.randomUUID();
    const startedAt  = randomTimestamp(DAYS);
    const duration   = randomInt(1, 5);
    const completedAt = addSeconds(startedAt, duration);
    const barcode    = isPass ? randomBarcode() : null;

    // Some cycles complete on all devices, some timeout
    const allReceived     = Math.random() > 0.15;
    const completionReason = allReceived ? "ALL_DEVICES_RECEIVED" : "TIMEOUT";

    // Which devices responded
    const expected = JSON.stringify(zone.devices);
    const received = allReceived
      ? JSON.stringify(zone.devices)
      : JSON.stringify([zone.devices[0]]); // only first device responded

    try {
      db.run(
        `INSERT OR IGNORE INTO zone_cycles
          (cycle_id, zone_id, zone_name, started_at, completed_at, status,
           barcode, image_name, first_record_id, completion_reason,
           expected_devices, received_devices, email_sent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          cycleId,
          zone.id,
          zone.name,
          startedAt,
          completedAt,
          status,
          barcode,
          status === "NR" ? `img_${cycleId.slice(0, 8)}` : null,
          0,           // first_record_id — 0 for dummy data
          completionReason,
          expected,
          received,
        ]
      );
      inserted++;
    } catch (err) {
      skipped++;
    }

    // Progress every 100
    if ((i + 1) % 100 === 0) {
      process.stdout.write(`  ... ${i + 1}/${COUNT}\r`);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));

  // ── Summary ───────────────────────────────────────────────────────────────
  const afterRes = db.exec("SELECT COUNT(*) as c FROM zone_cycles");
  const after    = afterRes[0]?.values[0][0] ?? 0;

  const byZone = db.exec(
    `SELECT zone_name,
            COUNT(*) as total,
            SUM(CASE WHEN status='PASS' THEN 1 ELSE 0 END) as pass,
            SUM(CASE WHEN status='NR'   THEN 1 ELSE 0 END) as nr
     FROM zone_cycles GROUP BY zone_name ORDER BY zone_name`
  );

  db.close();

  console.log(`\n✅  Done.`);
  console.log(`   Inserted : ${inserted}`);
  if (skipped) console.log(`   Skipped  : ${skipped} (duplicate cycle_id)`);
  console.log(`   DB total : ${before} → ${after} rows\n`);

  if (byZone.length) {
    console.log("── Zone breakdown ───────────────────────────────────────────");
    byZone[0].values.forEach(r => {
      const rate = r[1] > 0 ? Math.round((r[2] / r[1]) * 100) : 0;
      console.log(`   ${String(r[0]).padEnd(10)} | Total: ${String(r[1]).padStart(5)} | PASS: ${String(r[2]).padStart(5)} | NR: ${String(r[3]).padStart(5)} | Pass rate: ${rate}%`);
    });
    console.log("");
  }
}

main().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
