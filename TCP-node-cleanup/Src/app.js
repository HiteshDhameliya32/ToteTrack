require("dotenv").config();
const logger = require("./services/logger");

logger.info("CLEANUP SERVICE STARTED");

// START CLEANUP JOB
require("./jobs/cleanup.job");
