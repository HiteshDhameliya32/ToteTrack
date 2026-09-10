const {
  getMessagesTrend,
  getEmailStatusDistribution,
  getDailyRecords,
  getEmailHistory,
  getBusyHours,
  getEnhancedStats,
  getZoneBreakdown,
  getZonePassRate,
  getZoneDailyTrend,
} = require("../models/charts.model");

const messagesTrend = async (req, res, next) => {
  try {
    const data = await getMessagesTrend();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const emailStatus = async (req, res, next) => {
  try {
    const data = await getEmailStatusDistribution();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const dailyRecords = async (req, res, next) => {
  try {
    const data = await getDailyRecords();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const emailHistory = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === "Super Admin";
    const data = await getEmailHistory(req.user.company_id, isSuperAdmin);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const busyHours = async (req, res, next) => {
  try {
    const data = await getBusyHours();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const enhancedStats = async (req, res, next) => {
  try {
    const data = await getEnhancedStats();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const zoneBreakdown = async (req, res, next) => {
  try {
    const data = await getZoneBreakdown();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const zonePassRate = async (req, res, next) => {
  try {
    const data = await getZonePassRate();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

const zoneDailyTrend = async (req, res, next) => {
  try {
    const data = await getZoneDailyTrend();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

module.exports = {
  messagesTrend,
  emailStatus,
  dailyRecords,
  emailHistory,
  busyHours,
  enhancedStats,
  zoneBreakdown,
  zonePassRate,
  zoneDailyTrend,
};
