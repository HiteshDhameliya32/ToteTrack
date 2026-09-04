const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { JWT_SECRET } = require("../controllers/auth.controller");

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, message: "Invalid or expired token" });
    }

    // Verify user is still active in database
    const [users] = await db.query(
      `SELECT u.id, u.company_id, u.name, u.email, u.role, u.active, c.name AS company_name 
       FROM users u 
       JOIN companies c ON u.company_id = c.id 
       WHERE u.id = ? LIMIT 1`,
      [decoded.user_id]
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: "User no longer exists" });
    }

    const user = users[0];
    if (!user.active) {
      return res.status(403).json({ success: false, message: "User account is deactivated" });
    }

    req.user = {
      id: user.id,
      company_id: user.company_id,
      company_name: user.company_name,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (err) {
    next(err);
  }
};

const authorize = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      // Super Admin has access to everything
      if (req.user.role === "Super Admin") {
        return next();
      }

      // Check if user has permission assigned
      const [rows] = await db.query(
        `SELECT up.id 
         FROM user_permissions up
         JOIN permissions p ON up.permission_id = p.id
         WHERE up.user_id = ? AND p.code = ? LIMIT 1`,
        [req.user.id, permission]
      );

      if (rows.length === 0) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to perform this action.",
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

module.exports = { authenticate, authorize };
