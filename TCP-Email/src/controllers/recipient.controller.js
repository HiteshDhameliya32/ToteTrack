const {
  getRecipients, createRecipient, updateRecipient, deleteRecipient,
} = require("../models/email.model");
const db = require("../config/db");

const list = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === "Super Admin";
    const data = await getRecipients(req.user.company_id, isSuperAdmin);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ success: false, message: "Invalid email address" });
    const id = await createRecipient(email, req.user.company_id);
    
    // Audit log
    await db.execute(
      "INSERT INTO audit_logs (company_id, user_id, action, entity) VALUES (?, ?, ?, 'email_recipients')",
      [req.user.company_id, req.user.id, `Created Recipient: ${email}`]
    );

    res.status(201).json({ success: true, id });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { email, active } = req.body;
    const isSuperAdmin = req.user.role === "Super Admin";
    await updateRecipient(req.params.id, { email, active }, req.user.company_id, isSuperAdmin);
    
    // Audit log
    await db.execute(
      "INSERT INTO audit_logs (company_id, user_id, action, entity) VALUES (?, ?, ?, 'email_recipients')",
      [req.user.company_id, req.user.id, `Updated Recipient ID: ${req.params.id} (email: ${email}, active: ${active})`]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === "Super Admin";
    await deleteRecipient(req.params.id, req.user.company_id, isSuperAdmin);
    
    // Audit log
    await db.execute(
      "INSERT INTO audit_logs (company_id, user_id, action, entity) VALUES (?, ?, ?, 'email_recipients')",
      [req.user.company_id, req.user.id, `Deleted Recipient ID: ${req.params.id}`]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, update, remove };
