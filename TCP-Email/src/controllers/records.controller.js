const { sendSelectedRecords, sendFilteredRecords } = require("../services/records-email.service");

const sendSelected = async (req, res, next) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length)
      return res.status(400).json({ success: false, message: "ids must be a non-empty array" });

    const isSuperAdmin = req.user.role === "Super Admin";
    const result = await sendSelectedRecords(ids, req.user.company_id, isSuperAdmin);
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
};

const sendFiltered = async (req, res, next) => {
  try {
    const emailStatus = req.body.emailStatus || "all";
    const timeRange   = req.body.timeRange   || "all";
    const search      = req.body.search      || "";

    const isSuperAdmin = req.user.role === "Super Admin";
    const result = await sendFilteredRecords({ emailStatus, timeRange, search }, req.user.company_id, isSuperAdmin);
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
};

module.exports = { sendSelected, sendFiltered };
