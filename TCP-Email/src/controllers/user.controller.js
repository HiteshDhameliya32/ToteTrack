const db = require("../config/db");
const { hashPassword } = require("../utils/password");

const list = async (req, res, next) => {
  try {
    let query = `
      SELECT u.id, u.company_id, u.name, u.email, u.role, u.active, u.created_at, c.name AS company_name 
      FROM users u
      JOIN companies c ON u.company_id = c.id
    `;
    const params = [];

    if (req.user.role !== "Super Admin") {
      query += " WHERE u.company_id = ?";
      params.push(req.user.company_id);
    } else if (req.query.company_id) {
      query += " WHERE u.company_id = ?";
      params.push(req.query.company_id);
    }

    query += " ORDER BY u.created_at DESC";
    const [rows] = await db.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    let company_id = req.body.company_id;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    if (req.user.role !== "Super Admin") {
      // Admin can only create users for their own company
      company_id = req.user.company_id;
      if (role === "Super Admin") {
        return res.status(403).json({ success: false, message: "Admin cannot create Super Admin" });
      }
    } else {
      // Super Admin must specify company_id or default to their own
      company_id = company_id || req.user.company_id;
    }

    // Check if user already exists
    const [exist] = await db.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (exist.length > 0) {
      return res.status(400).json({ success: false, message: "Email already exists" });
    }

    const hashedPass = hashPassword(password);
    const [result] = await db.execute(
      "INSERT INTO users (company_id, name, email, password, role, active) VALUES (?, ?, ?, ?, ?, 1)",
      [company_id, name, email, hashedPass, role]
    );

    const newUserId = result.insertId;

    // Handle initial permissions if provided
    if (Array.isArray(req.body.permissions)) {
      const perms = req.body.permissions;
      if (perms.length > 0) {
        const [dbPerms] = await db.query("SELECT id FROM permissions WHERE code IN (?)", [perms]);
        for (const p of dbPerms) {
          await db.execute("INSERT INTO user_permissions (user_id, permission_id) VALUES (?, ?)", [
            newUserId,
            p.id,
          ]);
        }
      }
    }

    // Write audit log
    await db.execute(
      "INSERT INTO audit_logs (company_id, user_id, action, entity) VALUES (?, ?, ?, 'users')",
      [req.user.company_id, req.user.id, `Created User: ${email} (${role})`]
    );

    res.status(201).json({ success: true, id: newUserId });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, role, active, password } = req.body;

    // Check if user exists
    const [users] = await db.query("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const targetUser = users[0];

    // Access check: Admin can only update users of their own company
    if (req.user.role !== "Super Admin" && targetUser.company_id !== req.user.company_id) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    let query = "UPDATE users SET name = ?, email = ?, role = ?, active = ?";
    const params = [name, email, role, active];

    if (password && password.trim() !== "") {
      query += ", password = ?";
      params.push(hashPassword(password));
    }

    query += " WHERE id = ?";
    params.push(id);

    await db.execute(query, params);

    // If active was changed to 0, write specific audit log
    const statusMsg = active ? "Updated details" : "Deactivated User";

    // Write audit log
    await db.execute(
      "INSERT INTO audit_logs (company_id, user_id, action, entity) VALUES (?, ?, ?, 'users')",
      [req.user.company_id, req.user.id, `${statusMsg} for: ${email}`]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Check user exists
    const [users] = await db.query("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const targetUser = users[0];

    // Access check
    if (req.user.role !== "Super Admin" && targetUser.company_id !== req.user.company_id) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    if (req.user.id === Number(id)) {
      return res.status(400).json({ success: false, message: "You cannot delete yourself" });
    }

    await db.execute("DELETE FROM users WHERE id = ?", [id]);

    // Write audit log
    await db.execute(
      "INSERT INTO audit_logs (company_id, user_id, action, entity) VALUES (?, ?, ?, 'users')",
      [req.user.company_id, req.user.id, `Deleted User: ${targetUser.email}`]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

const getPermissions = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Get all permissions
    const [allPerms] = await db.query("SELECT * FROM permissions ORDER BY name ASC");

    // Get user's assigned permission codes
    const [userPerms] = await db.query(
      `SELECT p.code FROM user_permissions up 
       JOIN permissions p ON up.permission_id = p.id 
       WHERE up.user_id = ?`,
      [id]
    );
    const assigned = userPerms.map((up) => up.code);

    res.json({ success: true, all: allPerms, assigned });
  } catch (err) {
    next(err);
  }
};

const updatePermissions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body; // array of permission codes

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ success: false, message: "permissions must be an array" });
    }

    // Check user exists
    const [users] = await db.query("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const targetUser = users[0];

    // Access check
    if (req.user.role !== "Super Admin" && targetUser.company_id !== req.user.company_id) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // Delete existing permissions
    await db.execute("DELETE FROM user_permissions WHERE user_id = ?", [id]);

    // Insert new permissions
    if (permissions.length > 0) {
      const [dbPerms] = await db.query("SELECT id FROM permissions WHERE code IN (?)", [permissions]);
      for (const p of dbPerms) {
        await db.execute("INSERT INTO user_permissions (user_id, permission_id) VALUES (?, ?)", [
          id,
          p.id,
        ]);
      }
    }

    // Write audit log
    await db.execute(
      "INSERT INTO audit_logs (company_id, user_id, action, entity) VALUES (?, ?, ?, 'user_permissions')",
      [req.user.company_id, req.user.id, `Updated Permissions for user ID: ${id}`]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, update, remove, getPermissions, updatePermissions };
