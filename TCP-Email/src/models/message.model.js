const db = require("../config/db");

function getKolkataTimeStr(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type) => parts.find(p => p.type === type).value;
  return `${getPart("year")}-${getPart("month")}-${getPart("day")} ${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;
}

// ── Helper ─────────────────────────────────────────────
function shouldFilter(isSuperAdmin, companyId) {
  if (isSuperAdmin && !companyId) return false;
  return true;
}

// ── Unsent Records ─────────────────────────────────────
async function getUnsentRecords(companyId) {
  const [rows] = await db.execute(
    "SELECT id, received_at, message, port, image, folder_path, barcode, zone_id FROM tcp_messages WHERE email_sent = 0 AND company_id = ? ORDER BY received_at ASC, id ASC",
    [companyId]
  );
  return rows;
}

// ── Mark as Sent ───────────────────────────────────────
async function markAsSent(ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  await db.execute(
    `UPDATE tcp_messages SET email_sent = 1, email_sent_at = ? WHERE id IN (${placeholders})`,
    [getKolkataTimeStr(), ...ids]
  );
}

// ── Stats ──────────────────────────────────────────────
async function getStats(companyId, isSuperAdmin = false) {
  const filter = shouldFilter(isSuperAdmin, companyId);
  const cid = companyId || 1;

  if (filter) {
    const [[total]]   = await db.execute("SELECT COUNT(*) as count FROM tcp_messages WHERE company_id = ?", [cid]);
    const [[sent]]    = await db.execute("SELECT COUNT(*) as count FROM tcp_messages WHERE email_sent = 1 AND company_id = ?", [cid]);
    const [[pending]] = await db.execute("SELECT COUNT(*) as count FROM tcp_messages WHERE email_sent = 0 AND company_id = ?", [cid]);
    const [[today]]   = await db.execute("SELECT COUNT(*) as count FROM tcp_messages WHERE date(received_at) = date('now', '+5 hours', '+30 minutes') AND company_id = ?", [cid]);
    return { total: total.count, sent: sent.count, pending: pending.count, today: today.count };
  } else {
    const [[total]]   = await db.execute("SELECT COUNT(*) as count FROM tcp_messages");
    const [[sent]]    = await db.execute("SELECT COUNT(*) as count FROM tcp_messages WHERE email_sent = 1");
    const [[pending]] = await db.execute("SELECT COUNT(*) as count FROM tcp_messages WHERE email_sent = 0");
    const [[today]]   = await db.execute("SELECT COUNT(*) as count FROM tcp_messages WHERE date(received_at) = date('now', '+5 hours', '+30 minutes')");
    return { total: total.count, sent: sent.count, pending: pending.count, today: today.count };
  }
}

// ── Pending Paginated ──────────────────────────────────
async function getPendingPaginated({ page = 1, limit = 20, search = "" }, companyId, isSuperAdmin = false) {
  const offset = (page - 1) * limit;
  const filter = shouldFilter(isSuperAdmin, companyId);

  const where = ["email_sent = 0"];
  const params = [];

  if (filter) {
    where.push("company_id = ?");
    params.push(companyId || 1);
  }

  if (search) {
    where.push("(message LIKE ? OR CAST(id AS TEXT) LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereClause = `WHERE ${where.join(" AND ")}`;

  const [rows] = await db.execute(
    `SELECT id, received_at, message, port, image, folder_path, barcode, zone_id FROM tcp_messages ${whereClause} ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const [[{ count }]] = await db.execute(
    `SELECT COUNT(*) as count FROM tcp_messages ${whereClause}`,
    params
  );

  return { rows, total: count, page, limit };
}

// ── Time Range Helper ──────────────────────────────────
const TIME_RANGE_SQL = {
  "1h":  "received_at >= datetime('now', '+5 hours', '+30 minutes', '-1 hour')",
  "6h":  "received_at >= datetime('now', '+5 hours', '+30 minutes', '-6 hours')",
  "24h": "received_at >= datetime('now', '+5 hours', '+30 minutes', '-24 hours')",
  "7d":  "received_at >= datetime('now', '+5 hours', '+30 minutes', '-7 days')",
  "30d": "received_at >= datetime('now', '+5 hours', '+30 minutes', '-30 days')",
};

// ── Records (paginated, filterable) - Now queries zone_cycles with folder_path ───────────────────
async function getRecords({ page = 1, limit = 20, emailStatus = "all", timeRange = "all", search = "" }, companyId, isSuperAdmin = false) {
  const offset = (page - 1) * limit;
  
  const where = [];
  const params = [];

  // Filter by status (PASS/NR instead of email_sent)
  if (emailStatus === "sent")    where.push("zc.status = 'PASS'");
  if (emailStatus === "pending") where.push("zc.status = 'NR'");

  // Time range filter on started_at
  if (TIME_RANGE_SQL[timeRange]) {
    // Replace received_at with started_at in time range SQL
    const timeFilter = TIME_RANGE_SQL[timeRange].replace(/received_at/g, 'zc.started_at');
    where.push(timeFilter);
  }

  // Search by cycle_id or barcode
  if (search) {
    where.push("(zc.cycle_id LIKE ? OR zc.barcode LIKE ? OR CAST(zc.zone_id AS TEXT) LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // Join with user_tcp_configs for folder paths and tcp_zones for the zone name
  const [rows] = await db.query(
    `SELECT zc.id, zc.cycle_id, zc.zone_id,
            COALESCE(zc.zone_name, tz.name, 'Zone ' || zc.zone_id) AS zone_name,
            zc.started_at as received_at, zc.completed_at, 
            zc.status as email_sent, zc.barcode, zc.image_name as image, zc.first_record_id, 
            zc.completion_reason, zc.expected_devices, zc.received_devices,
            uc.folder_path_ok, uc.folder_path_nr
     FROM zone_cycles zc
     LEFT JOIN user_tcp_configs uc ON uc.zone_id = zc.zone_id AND uc.is_active = 1
     LEFT JOIN tcp_zones tz ON tz.id = zc.zone_id
     ${whereClause}
     GROUP BY zc.id
     ORDER BY zc.started_at DESC, zc.id DESC 
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  
  const [[{ count }]] = await db.query(
    `SELECT COUNT(DISTINCT zc.id) as count FROM zone_cycles zc ${whereClause}`,
    params
  );

  // Transform rows to match expected format
  const transformedRows = rows.map(r => ({
    id: r.id,
    cycle_id: r.cycle_id,
    zone_id: r.zone_id,
    zone_name: r.zone_name,
    received_at: r.received_at,
    completed_at: r.completed_at,
    message: `Cycle ${r.cycle_id.substring(0, 8)}... | ${r.completion_reason}`,
    port: null,
    image: r.image,
    folder_path: r.email_sent === 'PASS' ? r.folder_path_ok : r.folder_path_nr, // Use PASS/NR to select folder
    barcode: r.barcode,
    email_sent: r.email_sent === 'PASS' ? 1 : 0,
    email_sent_at: r.completed_at,
    completion_reason: r.completion_reason,
    expected_devices: r.expected_devices,
    received_devices: r.received_devices
  }));

  return { records: transformedRows, total: Number(count), page, pages: Math.ceil(count / limit) };
}

// ── Recent Records ─────────────────────────────────────
async function getRecentRecords(limit = 20, companyId, isSuperAdmin = false) {
  const filter = shouldFilter(isSuperAdmin, companyId);

  if (filter) {
    const [rows] = await db.execute(
      "SELECT id, received_at, message, port, image, folder_path, barcode, zone_id, email_sent FROM tcp_messages WHERE company_id = ? ORDER BY received_at DESC, id DESC LIMIT ?",
      [companyId || 1, limit]
    );
    return rows;
  }

  const [rows] = await db.execute(
    "SELECT id, received_at, message, port, image, folder_path, barcode, zone_id, email_sent FROM tcp_messages ORDER BY received_at DESC, id DESC LIMIT ?",
    [limit]
  );
  return rows;
}

// ── Records By IDs ─────────────────────────────────────
async function getRecordsByIds(ids, companyId = null, isSuperAdmin = true) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => "?").join(",");
  const filter = shouldFilter(isSuperAdmin, companyId);

  if (filter && companyId) {
    const [rows] = await db.query(
      `SELECT id, received_at, message, port, image, folder_path, barcode, zone_id, email_sent, email_sent_at FROM tcp_messages WHERE id IN (${placeholders}) AND company_id = ? ORDER BY received_at DESC, id DESC`,
      [...ids, companyId]
    );
    return rows;
  }

  const [rows] = await db.query(
    `SELECT id, received_at, message, port, image, folder_path, barcode, zone_id, email_sent, email_sent_at FROM tcp_messages WHERE id IN (${placeholders}) ORDER BY received_at DESC, id DESC`,
    ids
  );
  return rows;
}

// ── Records By Filter ──────────────────────────────────
async function getRecordsByFilter({ emailStatus = "all", timeRange = "all", search = "" }, companyId, isSuperAdmin = false) {
  const filter = shouldFilter(isSuperAdmin, companyId);

  const where = [];
  const params = [];

  if (filter) {
    where.push("company_id = ?");
    params.push(companyId || 1);
  }

  if (emailStatus === "sent")    where.push("email_sent = 1");
  if (emailStatus === "pending") where.push("email_sent = 0");
  if (TIME_RANGE_SQL[timeRange]) where.push(TIME_RANGE_SQL[timeRange]);

  if (search) {
    where.push("(message LIKE ? OR CAST(id AS TEXT) LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [rows] = await db.query(
    `SELECT id, received_at, message, port, image, folder_path, barcode, zone_id, email_sent, email_sent_at FROM tcp_messages ${whereClause} ORDER BY received_at DESC, id DESC`,
    params
  );
  return rows;
}

// ── Unsent Cycles (for scheduler) ─────────────────────────────────────────
async function getUnsentCycles(companyId) {
  // zone_cycles has no company_id — join user_tcp_configs to filter by company
  const [rows] = await db.query(
    `SELECT zc.id, zc.cycle_id, zc.zone_id,
            zc.started_at, zc.completed_at,
            zc.status, zc.barcode, zc.image_name,
            zc.completion_reason, zc.expected_devices, zc.received_devices,
            uc.folder_path_ok, uc.folder_path_nr
     FROM zone_cycles zc
     LEFT JOIN user_tcp_configs uc ON uc.zone_id = zc.zone_id AND uc.is_active = 1
     WHERE zc.email_sent = 0 AND zc.status IS NOT NULL
     GROUP BY zc.id
     ORDER BY zc.started_at ASC, zc.id ASC`
  );
  return rows.map(r => ({
    ...r,
    folder_path: r.status === "PASS" ? r.folder_path_ok : r.folder_path_nr,
  }));
}

// ── Mark Cycles as Sent ────────────────────────────────────────────────────
async function markCyclesSent(ids) {
  if (!ids.length) return;
  const placeholders = ids.map(() => "?").join(",");
  await db.execute(
    `UPDATE zone_cycles SET email_sent = 1, email_sent_at = ? WHERE id IN (${placeholders})`,
    [getKolkataTimeStr(), ...ids]
  );
}

// ── Report Data (date-range, all matching rows, with folder paths) ─────────
async function getReportData({ fromDt, toDt, status = "all", zoneId = null }) {
  const where  = [];
  const params = [];

  // fromDt / toDt are ISO strings in local time (Asia/Kolkata)
  if (fromDt) { where.push("zc.started_at >= ?"); params.push(fromDt); }
  if (toDt)   { where.push("zc.started_at <= ?"); params.push(toDt);   }

  if (status === "PASS") where.push("zc.status = 'PASS'");
  if (status === "NR")   where.push("zc.status = 'NR'");

  // Zone filter — only when a specific zone is selected
  if (zoneId) { where.push("zc.zone_id = ?"); params.push(Number(zoneId)); }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [rows] = await db.query(
    `SELECT zc.id, zc.cycle_id, zc.zone_id,
            COALESCE(zc.zone_name, tz.name, 'Zone ' || zc.zone_id) AS zone_name,
            zc.started_at, zc.completed_at,
            zc.status, zc.barcode, zc.image_name,
            zc.completion_reason, zc.expected_devices, zc.received_devices,
            uc.folder_path_ok, uc.folder_path_nr
     FROM zone_cycles zc
     LEFT JOIN user_tcp_configs uc ON uc.zone_id = zc.zone_id AND uc.is_active = 1
     LEFT JOIN tcp_zones tz ON tz.id = zc.zone_id
     ${whereClause}
     GROUP BY zc.id
     ORDER BY zc.started_at ASC, zc.id ASC`,
    params
  );

  // Resolve the correct folder path per row
  return rows.map(r => ({
    ...r,
    folder_path: r.status === "PASS" ? r.folder_path_ok : r.folder_path_nr,
  }));
}

// ── Delete Cycles by IDs ───────────────────────────────────────────────────
async function deleteCyclesByIds(ids) {
  if (!ids || !ids.length) return 0;
  const placeholders = ids.map(() => "?").join(",");
  const [result] = await db.execute(
    `DELETE FROM zone_cycles WHERE id IN (${placeholders})`,
    ids
  );
  return result.affectedRows ?? 0;
}

// ── Delete Cycles by Filter (all matching) ─────────────────────────────────
async function deleteCyclesByFilter({ emailStatus = "all", timeRange = "all", search = "" }) {
  const where  = [];
  const params = [];

  if (emailStatus === "sent")    where.push("status = 'PASS'");
  if (emailStatus === "pending") where.push("status = 'NR'");

  if (TIME_RANGE_SQL[timeRange]) {
    where.push(TIME_RANGE_SQL[timeRange].replace(/received_at/g, "started_at"));
  }

  if (search) {
    where.push("(cycle_id LIKE ? OR barcode LIKE ? OR CAST(zone_id AS TEXT) LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [result] = await db.execute(
    `DELETE FROM zone_cycles ${whereClause}`,
    params
  );
  return result.affectedRows ?? 0;
}

module.exports = {
  getUnsentRecords,
  markAsSent,
  getStats,
  getPendingPaginated,
  getRecords,
  getRecentRecords,
  getRecordsByIds,
  getRecordsByFilter,
  getReportData,
  getUnsentCycles,
  markCyclesSent,
  deleteCyclesByIds,
  deleteCyclesByFilter,
};
