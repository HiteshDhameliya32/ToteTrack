const { RECONNECT_DELAY } = require("../config/env");
const logger = require("../services/logger");

let reconnectTimer = null;

function reconnect(connectFn) {
  if (reconnectTimer) return;

  logger.info(`RECONNECT IN ${RECONNECT_DELAY}ms`);
  console.log(`🔄 Retry after ${RECONNECT_DELAY}ms`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (typeof connectFn === "function") connectFn();
  }, RECONNECT_DELAY);
}

module.exports = { reconnect };