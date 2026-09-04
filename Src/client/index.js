const { connectAll, stopAll } = require("./client");
const logger = require("../services/logger");

connectAll();

process.on("SIGINT", () => {
  logger.info("APPLICATION STOPPED");
  stopAll();
  process.exit();
});

logger.info("APPLICATION STARTED");
console.log("🚀 SYSTEM STARTED");
