require("dotenv").config();

module.exports = {
  INITIAL_MESSAGE: process.env.INITIAL_MESSAGE || "",
  RECONNECT_DELAY: Number(process.env.RECONNECT_DELAY || 5000),
  LOG_FOLDER:      process.env.LOG_FOLDER || "logs",
};
