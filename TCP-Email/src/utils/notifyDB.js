const path = require("path");

// Lazy-load db so this file can be required before dotenv runs in other services
function getDb() {
  return require(path.resolve(__dirname, "../config/db"));
}

// io is set by app.js after socket server starts
let _io = null;
function setIO(io) { _io = io; }

async function insertNotification({ service_name, severity, title, message, company_id }) {
  try {
    const db = getDb();
    const finalCompanyId = company_id || 1; // Default to company 1
    const [result] = await db.execute(
      "INSERT INTO system_notifications (service_name, severity, title, message, company_id) VALUES (?, ?, ?, ?, ?)",
      [service_name, severity, title, String(message).slice(0, 1000), finalCompanyId]
    );
    if (_io) {
      const [rows] = await db.execute(
        "SELECT * FROM system_notifications WHERE id = ?",
        [result.insertId]
      );
      // Emit the event to frontend. 
      // Note: Frontend will filter by active company_id on receiving
      _io.emit("notification:new", rows[0]);
    }
  } catch (_) {
    // never crash the calling service over a notification failure
  }
}

module.exports = { insertNotification, setIO };
