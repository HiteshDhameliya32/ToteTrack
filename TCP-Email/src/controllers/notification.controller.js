const model = require("../models/notification.model");

const list = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === "Super Admin";
    const data = await model.list({ severity: req.query.severity }, req.user.company_id, isSuperAdmin);
    res.json({ success: true, data });
  } catch (e) { next(e); }
};

const unreadCount = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === "Super Admin";
    const count = await model.unreadCount(req.user.company_id, isSuperAdmin);
    res.json({ success: true, count });
  } catch (e) { next(e); }
};

const markRead = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === "Super Admin";
    await model.markRead(req.params.id, req.user.company_id, isSuperAdmin);
    res.json({ success: true });
  } catch (e) { next(e); }
};

const markAllRead = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === "Super Admin";
    await model.markAllRead(req.user.company_id, isSuperAdmin);
    res.json({ success: true });
  } catch (e) { next(e); }
};

module.exports = { list, unreadCount, markRead, markAllRead };
