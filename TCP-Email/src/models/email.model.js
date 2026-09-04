const db = require("../config/db");

// ── Helper ─────────────────────────────────────────────
function shouldFilter(isSuperAdmin, companyId) {
  if (isSuperAdmin && !companyId) return false;
  return true;
}

// ── Schedules ──────────────────────────────────────────
async function getSchedules(companyId, isSuperAdmin = false) {
  if (!shouldFilter(isSuperAdmin, companyId)) {
    const [rows] = await db.execute("SELECT s.*, c.name AS company_name FROM email_schedules s JOIN companies c ON s.company_id = c.id ORDER BY s.time ASC");
    return rows;
  }
  const [rows] = await db.execute(
    "SELECT * FROM email_schedules WHERE company_id = ? ORDER BY time ASC",
    [companyId]
  );
  return rows;
}

async function getActiveSchedules(companyId = null) {
  if (companyId === null) {
    // Used by global cron scheduler to load all schedules across companies
    const [rows] = await db.execute("SELECT * FROM email_schedules WHERE active = 1 ORDER BY time ASC");
    return rows;
  }
  const [rows] = await db.execute(
    "SELECT * FROM email_schedules WHERE active = 1 AND company_id = ? ORDER BY time ASC",
    [companyId]
  );
  return rows;
}

async function createSchedule(time, companyId) {
  const [result] = await db.execute(
    "INSERT INTO email_schedules (time, company_id) VALUES (?, ?)",
    [time, companyId]
  );
  return result.insertId;
}

async function updateSchedule(id, { time, active }, companyId, isSuperAdmin = false) {
  if (isSuperAdmin) {
    await db.execute("UPDATE email_schedules SET time = ?, active = ? WHERE id = ?", [time, active, id]);
  } else {
    await db.execute(
      "UPDATE email_schedules SET time = ?, active = ? WHERE id = ? AND company_id = ?",
      [time, active, id, companyId]
    );
  }
}

async function deleteSchedule(id, companyId, isSuperAdmin = false) {
  if (isSuperAdmin) {
    await db.execute("DELETE FROM email_schedules WHERE id = ?", [id]);
  } else {
    await db.execute("DELETE FROM email_schedules WHERE id = ? AND company_id = ?", [id, companyId]);
  }
}

// ── Recipients ─────────────────────────────────────────
async function getRecipients(companyId, isSuperAdmin = false) {
  if (!shouldFilter(isSuperAdmin, companyId)) {
    const [rows] = await db.execute("SELECT r.*, c.name AS company_name FROM email_recipients r JOIN companies c ON r.company_id = c.id ORDER BY r.created_at DESC");
    return rows;
  }
  const [rows] = await db.execute(
    "SELECT * FROM email_recipients WHERE company_id = ? ORDER BY created_at DESC",
    [companyId]
  );
  return rows;
}

async function getActiveRecipients(companyId) {
  const [rows] = await db.execute(
    "SELECT email FROM email_recipients WHERE active = 1 AND company_id = ?",
    [companyId]
  );
  return rows.map((r) => r.email);
}

async function createRecipient(email, companyId) {
  const [result] = await db.execute(
    "INSERT INTO email_recipients (email, company_id) VALUES (?, ?)",
    [email, companyId]
  );
  return result.insertId;
}

async function updateRecipient(id, { email, active }, companyId, isSuperAdmin = false) {
  if (isSuperAdmin) {
    await db.execute("UPDATE email_recipients SET email = ?, active = ? WHERE id = ?", [email, active, id]);
  } else {
    await db.execute(
      "UPDATE email_recipients SET email = ?, active = ? WHERE id = ? AND company_id = ?",
      [email, active, id, companyId]
    );
  }
}

async function deleteRecipient(id, companyId, isSuperAdmin = false) {
  if (isSuperAdmin) {
    await db.execute("DELETE FROM email_recipients WHERE id = ?", [id]);
  } else {
    await db.execute("DELETE FROM email_recipients WHERE id = ? AND company_id = ?", [id, companyId]);
  }
}

// ── Email Logs ─────────────────────────────────────────
async function createEmailLog({ record_count, status, error_message, date_from, date_to, action, recipients }, companyId) {
  const [result] = await db.execute(
    "INSERT INTO email_logs (record_count, status, error_message, date_from, date_to, action, recipients, company_id) VALUES (?,?,?,?,?,?,?,?)",
    [
      record_count,
      status,
      error_message || null,
      date_from || null,
      date_to || null,
      action || null,
      recipients || null,
      companyId,
    ]
  );
  return result.insertId;
}

async function getEmailLogs({ page = 1, limit = 20 } = {}, companyId, isSuperAdmin = false) {
  const offset = (page - 1) * limit;
  const filter = shouldFilter(isSuperAdmin, companyId);

  if (filter) {
    const cid = companyId || 1;
    const [rows] = await db.execute(
      "SELECT l.*, c.name as company_name FROM email_logs l JOIN companies c ON l.company_id = c.id WHERE l.company_id = ? ORDER BY l.sent_at DESC LIMIT ? OFFSET ?",
      [cid, limit, offset]
    );
    const [[{ count }]] = await db.execute(
      "SELECT COUNT(*) as count FROM email_logs WHERE company_id = ?",
      [cid]
    );
    return { rows, total: count, page, limit };
  }

  // Super Admin — no filter
  const [rows] = await db.execute(
    "SELECT l.*, c.name as company_name FROM email_logs l JOIN companies c ON l.company_id = c.id ORDER BY l.sent_at DESC LIMIT ? OFFSET ?",
    [limit, offset]
  );
  const [[{ count }]] = await db.execute("SELECT COUNT(*) as count FROM email_logs");
  return { rows, total: count, page, limit };
}

async function getEmailSuccessCount(companyId, isSuperAdmin = false) {
  const filter = shouldFilter(isSuperAdmin, companyId);

  if (filter) {
    const [[{ count }]] = await db.execute(
      "SELECT COUNT(*) as count FROM email_logs WHERE status = 'success' AND company_id = ?",
      [companyId || 1]
    );
    return count;
  }

  // Super Admin — no filter
  const [[{ count }]] = await db.execute("SELECT COUNT(*) as count FROM email_logs WHERE status = 'success'");
  return count;
}

// ── SMTP Settings ──────────────────────────────────────
async function getSmtpSettings(companyId) {
  // Try to find SMTP settings for the specific company
  const [rows] = await db.execute("SELECT * FROM smtp_settings WHERE company_id = ? LIMIT 1", [companyId]);
  if (rows.length > 0) return rows[0];

  // Fallback to first company settings or return a default placeholder
  const [fallback] = await db.execute("SELECT * FROM smtp_settings ORDER BY id ASC LIMIT 1");
  return fallback[0] || null;
}

async function upsertSmtpSettings({ host, port, user, pass, from_name }, companyId) {
  const [rows] = await db.execute("SELECT id FROM smtp_settings WHERE company_id = ? LIMIT 1", [companyId]);
  if (rows.length) {
    await db.execute(
      "UPDATE smtp_settings SET host=?, port=?, user=?, pass=?, from_name=? WHERE id=?",
      [host, port, user, pass, from_name, rows[0].id]
    );
  } else {
    await db.execute(
      "INSERT INTO smtp_settings (host, port, user, pass, from_name, company_id) VALUES (?,?,?,?,?,?)",
      [host, port, user, pass, from_name, companyId]
    );
  }
}

module.exports = {
  getSchedules,
  getActiveSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  getRecipients,
  getActiveRecipients,
  createRecipient,
  updateRecipient,
  deleteRecipient,
  createEmailLog,
  getEmailLogs,
  getEmailSuccessCount,
  getSmtpSettings,
  upsertSmtpSettings,
};
