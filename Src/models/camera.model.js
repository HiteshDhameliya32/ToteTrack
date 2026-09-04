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

const Camera = {
  getAll: () =>
    db.execute("SELECT * FROM camera_configs ORDER BY ip_address, port"),

  getActive: () =>
    db.execute(
      "SELECT * FROM camera_configs WHERE is_active = 1 ORDER BY ip_address, port"
    ),

  getById: (id) =>
    db.execute("SELECT * FROM camera_configs WHERE id = ?", [id]),

  create: ({ camera_name, ip_address, port, is_active = 1 }) =>
    db.execute(
      "INSERT INTO camera_configs (camera_name, ip_address, port, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      [camera_name, ip_address, port, is_active, getKolkataTimeStr(), getKolkataTimeStr()]
    ),

  update: (id, { camera_name, ip_address, port, is_active }) =>
    db.execute(
      // SQLite has no ON UPDATE CURRENT_TIMESTAMP — set updated_at manually
      "UPDATE camera_configs SET camera_name=?, ip_address=?, port=?, is_active=?, updated_at=? WHERE id=?",
      [camera_name, ip_address, port, is_active, getKolkataTimeStr(), id]
    ),

  delete: (id) =>
    db.execute("DELETE FROM camera_configs WHERE id=?", [id]),

  saveLog: ({ camera_id, ip_address, port, message }) =>
    db.execute(
      "INSERT INTO tcp_logs (camera_id, ip_address, port, message, received_at) VALUES (?, ?, ?, ?, ?)",
      [camera_id || null, ip_address, port, message, getKolkataTimeStr()]
    ),

  getLogs: (limit = 100) =>
    db.execute(
      `SELECT l.*, c.camera_name
       FROM tcp_logs l
       LEFT JOIN camera_configs c ON c.id = l.camera_id
       ORDER BY l.received_at DESC LIMIT ?`,
      [limit]
    ),
};

module.exports = Camera;
