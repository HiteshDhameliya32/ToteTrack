const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const path = require("path");
const fs   = require("fs");

const logDir = path.join(process.cwd(), "logs", "tcp-dashboard");
fs.mkdirSync(logDir, { recursive: true });

const fmt = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
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

module.exports = logger;
