const db = require("../config/db");
const jwt = require("jsonwebtoken");
const { verifyPassword } = require("../utils/password");

const JWT_SECRET = process.env.JWT_SECRET || "tcp_secret_key_123_456_789";

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    // Find user and join company name
    const [users] = await db.query(
      `SELECT u.*, c.name AS company_name 
       FROM users u 
       JOIN companies c ON u.company_id = c.id 
       WHERE u.email = ? LIMIT 1`,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const user = users[0];

    if (!user.active) {
      return res.status(403).json({ success: false, message: "User account is deactivated" });
    }

    // Verify Password
    const isValid = verifyPassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    // Fetch user permissions
    const [perms] = await db.query(
      `SELECT p.code 
       FROM user_permissions up 
       JOIN permissions p ON up.permission_id = p.id 
       WHERE up.user_id = ?`,
      [user.id]
    );
    const permissions = perms.map((p) => p.code);

    // Sign JWT
    const token = jwt.sign(
      {
        user_id: user.id,
        company_id: user.company_id,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    // Write audit log
    await db.execute(
      "INSERT INTO audit_logs (company_id, user_id, action, entity) VALUES (?, ?, 'User Logged In', 'users')",
      [user.company_id, user.id]
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        company_id: user.company_id,
        company_name: user.company_name,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions,
      },
    });
  } catch (err) {
    next(err);
  }
};

const me = async (req, res, next) => {
  try {
    // req.user is set by authenticate middleware
    // Let's reload the user permissions to ensure they are up to date
    const [perms] = await db.query(
      `SELECT p.code 
       FROM user_permissions up 
       JOIN permissions p ON up.permission_id = p.id 
       WHERE up.user_id = ?`,
      [req.user.id]
    );
    const permissions = perms.map((p) => p.code);

    res.json({
      success: true,
      user: {
        ...req.user,
        permissions,
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { login, me, JWT_SECRET };
