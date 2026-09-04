const db = require("../config/db");

const list = async (req, res, next) => {
  try {
    if (req.user.role !== "Super Admin") {
      return res.status(403).json({ success: false, message: "Only Super Admin can manage companies" });
    }

    const [rows] = await db.query("SELECT * FROM companies ORDER BY name ASC");
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    if (req.user.role !== "Super Admin") {
      return res.status(403).json({ success: false, message: "Only Super Admin can manage companies" });
    }

    const { name } = req.body;
    if (!name || name.trim() === "") {
      return res.status(400).json({ success: false, message: "Company name is required" });
    }

    // Check if company already exists
    const [exist] = await db.query("SELECT id FROM companies WHERE name = ? LIMIT 1", [name]);
    if (exist.length > 0) {
      return res.status(400).json({ success: false, message: "Company name already exists" });
    }

    const [result] = await db.execute("INSERT INTO companies (name) VALUES (?)", [name]);

    // Write audit log
    await db.execute(
      "INSERT INTO audit_logs (company_id, user_id, action, entity) VALUES (?, ?, ?, 'companies')",
      [req.user.company_id, req.user.id, `Created Company: ${name}`]
    );

    res.status(201).json({ success: true, id: result.insertId });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create };
