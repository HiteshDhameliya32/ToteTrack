const { getEmailLogs, getEmailSuccessCount } = require("../models/email.model");
const { getStats, getPendingPaginated, getRecords, getRecentRecords, deleteCyclesByIds, deleteCyclesByFilter } = require("../models/message.model");
const { sendEmailReport } = require("../services/email.service");

const logs = async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const isSuperAdmin = req.user.role === "Super Admin";
    const data = await getEmailLogs({ page, limit }, req.user.company_id, isSuperAdmin);
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
};

const sendNow = async (req, res, next) => {
  try {
    const result = await sendEmailReport(req.user.company_id);
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
};

const dashboardStats = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === "Super Admin";
    const [stats, emailSuccess] = await Promise.all([
      getStats(req.user.company_id, isSuperAdmin),
      getEmailSuccessCount(req.user.company_id, isSuperAdmin),
    ]);
    res.json({ success: true, data: { ...stats, emailSuccess, pendingEmails: stats.pending } });
  } catch (err) {
    next(err);
  }
};

const pending = async (req, res, next) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = req.query.search || "";
    const isSuperAdmin = req.user.role === "Super Admin";
    const data = await getPendingPaginated({ page, limit, search }, req.user.company_id, isSuperAdmin);
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
};

const records = async (req, res, next) => {
  try {
    const page        = Number(req.query.page)  || 1;
    const limit       = Number(req.query.limit) || 20;
    const emailStatus = req.query.emailStatus   || "all";
    const timeRange   = req.query.timeRange     || "all";
    const search      = req.query.search        || "";
    const isSuperAdmin = req.user.role === "Super Admin";
    const data = await getRecords({ page, limit, emailStatus, timeRange, search }, req.user.company_id, isSuperAdmin);
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
};

const recentRecords = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === "Super Admin";
    const data = await getRecentRecords(10, req.user.company_id, isSuperAdmin);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// Get folder path for a zone's device (for image display)
const getZoneFolderPath = async (req, res, next) => {
  try {
    const { zoneId, status } = req.query;
    
    if (!zoneId) {
      return res.status(400).json({ success: false, error: "zoneId is required" });
    }
    
    // Get first device from the zone to determine folder path
    const db = require("../config/db");
    const [devices] = await db.execute(
      `SELECT folder_path_ok, folder_path_nr 
       FROM user_tcp_configs 
       WHERE zone_id = ? AND is_active = 1 
       LIMIT 1`,
      [zoneId]
    );
    
    if (!devices || devices.length === 0) {
      return res.json({ success: true, folder_path: null });
    }
    
    // Return NR folder for NR status, OK folder for PASS status
    const folder_path = status === 'NR' || status === '0' 
      ? devices[0].folder_path_nr 
      : devices[0].folder_path_ok;
    
    res.json({ success: true, folder_path });
  } catch (err) {
    next(err);
  }
};

// Delete selected cycle records by IDs (Super Admin only)
const deleteSelectedRecords = async (req, res, next) => {
  try {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "ids[] array is required" });
    }
    const deleted = await deleteCyclesByIds(ids);
    res.json({ success: true, deleted });
  } catch (err) {
    next(err);
  }
};

// Delete all cycles matching current filters (Super Admin only)
const deleteFilteredRecords = async (req, res, next) => {
  try {
    const emailStatus = req.body.emailStatus || "all";
    const timeRange   = req.body.timeRange   || "all";
    const search      = req.body.search      || "";
    const deleted = await deleteCyclesByFilter({ emailStatus, timeRange, search });
    res.json({ success: true, deleted });
  } catch (err) {
    next(err);
  }
};

module.exports = { logs, sendNow, dashboardStats, pending, records, recentRecords, getZoneFolderPath, deleteSelectedRecords, deleteFilteredRecords };
