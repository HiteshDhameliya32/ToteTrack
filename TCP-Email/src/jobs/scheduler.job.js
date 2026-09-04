const cron = require("node-cron");
const { getActiveSchedules } = require("../models/email.model");
const { sendEmailReport } = require("../services/email.service");
const logger = require("../utils/logger");

const activeTasks = new Map();

function timeToCron(time) {
  const [hour, minute] = time.split(":");
  return `${minute} ${hour} * * *`;
}

async function reloadSchedules() {
  // Stop all existing tasks
  activeTasks.forEach((task) => task.stop());
  activeTasks.clear();

  // Load all active schedules across all companies
  const schedules = await getActiveSchedules(null);

  schedules.forEach((schedule) => {
    const cronExpr = timeToCron(schedule.time);
    const task = cron.schedule(cronExpr, async () => {
      logger.info(`Cron triggered for schedule id=${schedule.id} company=${schedule.company_id} time=${schedule.time}`);
      await sendEmailReport(schedule.company_id);
    });
    activeTasks.set(schedule.id, task);
    logger.info(`Scheduled email for Company ID ${schedule.company_id} at ${schedule.time} (${cronExpr})`);
  });

  logger.info(`Loaded ${schedules.length} active schedule(s) across all companies`);
}

module.exports = { reloadSchedules };
