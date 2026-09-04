const db = require("../config/db");

// ── Helper ─────────────────────────────────────────────
function shouldFilter(isSuperAdmin, companyId) {
  if (isSuperAdmin && !companyId) return false;
  return true;
}

const list = (filters = {}, companyId, isSuperAdmin = false) => {
  const where = [];
  const vals  = [];

  if (shouldFilter(isSuperAdmin, companyId)) {
    where.push("company_id = ?");
    vals.push(companyId || 1);
  }

  if (filters.severity) {
    where.push("severity = ?");
    vals.push(filters.severity);
  }

  const sql = `SELECT * FROM system_notifications ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT 100`;
  return db.execute(sql, vals).then(([rows]) => rows);
};

const unreadCount = (companyId, isSuperAdmin = false) => {
  if (shouldFilter(isSuperAdmin, companyId)) {
    const sql = "SELECT COUNT(*) AS count FROM system_notifications WHERE is_read = 0 AND company_id = ?";
    return db.execute(sql, [companyId || 1]).then(([rows]) => rows[0].count);
  }

  // Super Admin — no filter
  return db.execute("SELECT COUNT(*) AS count FROM system_notifications WHERE is_read = 0")
    .then(([rows]) => rows[0].count);
};

const markRead = (id, companyId, isSuperAdmin = false) => {
  if (isSuperAdmin) {
    return db.execute("UPDATE system_notifications SET is_read = 1 WHERE id = ?", [id]);
  }
  return db.execute("UPDATE system_notifications SET is_read = 1 WHERE id = ? AND company_id = ?", [id, companyId]);
};

const markAllRead = (companyId, isSuperAdmin = false) => {
  if (isSuperAdmin) {
    return db.execute("UPDATE system_notifications SET is_read = 1 WHERE is_read = 0");
  }
  return db.execute("UPDATE system_notifications SET is_read = 1 WHERE is_read = 0 AND company_id = ?", [companyId]);
};

module.exports = { list, unreadCount, markRead, markAllRead };
