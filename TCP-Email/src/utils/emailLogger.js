/**
 * emailLogger.js — Dedicated logger for email send events.
 *
 * Writes to:
 *   logs/tcp-email/email-YYYY-MM-DD.log   (all email events)
 *
 * Usage:
 *   const emailLogger = require("../utils/emailLogger");
 *   emailLogger.info("Zone1: ZIP built — 9.2 KB");
 *   emailLogger.error("Zone1: Send failed — timeout");
 */

const winston          = require("winston");
const DailyRotateFile  = require("winston-daily-rotate-file");
const path             = require("path");
const fs               = require("fs");

const logDir = path.join(process.cwd(), "logs", "tcp-email");
fs.mkdirSync(logDir, { recursive: true });

const fmt = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    const lvl = level.toUpperCase().padEnd(5);
    return `[${timestamp}] ${lvl} ${stack || message}`;
  })
);

const emailLogger = winston.createLogger({
  level: "info",
  format: fmt,
  transports: [
    // Dedicated daily-rotating file — email events only
    new DailyRotateFile({
      dirname:     logDir,
      filename:    "email-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      maxFiles:    "60d",           // keep 60 days of email logs
      format:      fmt,
    }),
    // Also echo to console so concurrently shows it in real time
    new winston.transports.Console({ format: fmt }),
  ],
});

module.exports = emailLogger;
