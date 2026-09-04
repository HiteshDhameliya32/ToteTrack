const { getSmtpSettings, upsertSmtpSettings } = require("../models/email.model");
const { createTransporter } = require("../config/mailer");
const db = require("../config/db");

const get = async (req, res, next) => {
  try {
    const data = await getSmtpSettings(req.user.company_id);
    if (data) delete data.pass; // never expose password
    res.json({ success: true, data: data || {} });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { host, port, user, pass, from_name } = req.body;
    if (!host || !port || !user || !pass || !from_name)
      return res.status(400).json({ success: false, message: "All fields are required" });
    
    await upsertSmtpSettings({ host, port: Number(port), user, pass, from_name }, req.user.company_id);

    // Audit log
    await db.execute(
      "INSERT INTO audit_logs (company_id, user_id, action, entity) VALUES (?, ?, 'SMTP Settings Updated', 'smtp_settings')",
      [req.user.company_id, req.user.id]
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

const testEmail = async (req, res, next) => {
  try {
    const { to } = req.body;
    if (!to) return res.status(400).json({ success: false, message: "Recipient email required" });

    const smtp = await getSmtpSettings(req.user.company_id);
    if (!smtp) return res.status(400).json({ success: false, message: "SMTP not configured" });

    const transporter = await createTransporter(req.user.company_id);
    await transporter.sendMail({
      from: `${smtp.from_name} <${smtp.user}>`,
      to,
      subject: "ToteTrack — SMTP Test",
      html: "<p>SMTP configuration is working correctly. ✅</p>",
    });

    // Audit log
    await db.execute(
      "INSERT INTO audit_logs (company_id, user_id, action, entity) VALUES (?, ?, ?, 'smtp_settings')",
      [req.user.company_id, req.user.id, `Sent test email to ${to}`]
    );

    res.json({ success: true, message: "Test email sent successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { get, update, testEmail };
