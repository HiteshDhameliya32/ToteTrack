const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");
const fs   = require("fs");

const logDir = path.join(process.cwd(), "logs", "tcp-node");
fs.mkdirSync(logDir, { recursive: true });

const fmt = winston.format.combine(
  winston.format.timestamp({
    format: () => {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
      const parts = formatter.formatToParts(new Date());
      const getPart = (type) => parts.find(p => p.type === type).value;
      return `${getPart("year")}-${getPart("month")}-${getPart("day")} ${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;
    }
  }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) =>
    `[${timestamp}] ${level.toUpperCase()} ${stack || message}`
  )
);

const logger = winston.createLogger({
  level: "info",
  format: fmt,
  transports: [
    new winston.transports.Console({ format: fmt }),
    new DailyRotateFile({ dirname: logDir, filename: "app-%DATE%.log",   datePattern: "YYYY-MM-DD", maxFiles: "30d" }),
    new DailyRotateFile({ dirname: logDir, filename: "error-%DATE%.log", datePattern: "YYYY-MM-DD", level: "error", maxFiles: "30d" }),
  ],
});

logger.dataReceived = (m) => logger.info(m);
logger.disconnect   = (m) => logger.info(m);
logger.serverError  = (m) => logger.error(m);
logger.dbEvent      = (m) => logger.info(m);
logger.success      = (m) => logger.info(m);
logger.log          = (m) => logger.info(m);

module.exports = logger;
