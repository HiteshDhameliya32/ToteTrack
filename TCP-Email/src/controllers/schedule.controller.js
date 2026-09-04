const {
  getSchedules, createSchedule, updateSchedule, deleteSchedule,
} = require("../models/email.model");
const { reloadSchedules } = require("../jobs/scheduler.job");
const db = require("../config/db");

const list = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === "Super Admin";
    const data = await getSchedules(req.user.company_id, isSuperAdmin);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { time } = req.body;
    if (!time || !/^\d{2}:\d{2}$/.test(time))
      return res.status(400).json({ success: false, message: "Invalid time format. Use HH:MM" });
    
    const id = await createSchedule(time, req.user.company_id);
    
    // Audit log
    await db.execute(
      "INSERT INTO audit_logs (company_id, user_id, action, entity) VALUES (?, ?, ?, 'email_schedules')",
      [req.user.company_id, req.user.id, `Created Schedule: ${time}`]
    );

    await reloadSchedules();
    res.status(201).json({ success: true, id });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { time, active } = req.body;
    const isSuperAdmin = req.user.role === "Super Admin";
    await updateSchedule(req.params.id, { time, active }, req.user.company_id, isSuperAdmin);
    
    // Audit log
    await db.execute(
      "INSERT INTO audit_logs (company_id, user_id, action, entity) VALUES (?, ?, ?, 'email_schedules')",
      [req.user.company_id, req.user.id, `Updated Schedule ID: ${req.params.id} (time: ${time}, active: ${active})`]
    );

    await reloadSchedules();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === "Super Admin";
    await deleteSchedule(req.params.id, req.user.company_id, isSuperAdmin);
    
    // Audit log
    await db.execute(
      "INSERT INTO audit_logs (company_id, user_id, action, entity) VALUES (?, ?, ?, 'email_schedules')",
      [req.user.company_id, req.user.id, `Deleted Schedule ID: ${req.params.id}`]
    );

    await reloadSchedules();
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { list, create, update, remove };
