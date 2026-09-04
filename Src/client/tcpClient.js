const net = require("net");
const db = require("../config/db");
const { HOST, PORT, INITIAL_MESSAGE } = require("../config/env");
const logger = require("../services/logger");

let client = null;

function connect() {
  client = new net.Socket();

  console.log(`🔄 Connecting ${HOST}:${PORT}`);
  logger.info(`CONNECTING ${HOST}:${PORT}`);

  client.connect(PORT, HOST, () => {
    console.log("✅ CONNECTED");
    logger.success(`CONNECTED ${HOST}:${PORT}`);

    if (INITIAL_MESSAGE) {
      client.write(INITIAL_MESSAGE + "\r\n");
      logger.info(`INITIAL MESSAGE SENT: ${INITIAL_MESSAGE}`);
    }
  });

  client.on("data", async (data) => {
    try {
      const text = data.toString().trim();

      console.log("📩", text);
      logger.dataReceived(text);

      // Default company_id = 1 for background raw logs
      await db.execute(
        "INSERT INTO tcp_messages (message, company_id) VALUES (?, 1)",
        [text]
      );

      logger.dbEvent(`Saved message to database: ${text}`);
      console.log("✅ Saved to MySQL");
    } catch (err) {
      console.error("DB Error:", err.message);
      logger.serverError(`DB Error: ${err.message}`);
    }
  });

  client.on("end", () => {
    console.log("🔚 SERVER ENDED CONNECTION");
    logger.disconnect("SERVER ENDED CONNECTION");
  });

  client.on("close", () => {
    console.log("❌ DISCONNECTED");
    logger.disconnect("DISCONNECTED");

    client.removeAllListeners();
    client.destroy();

    // require reconnect at call-time and pass the connect function
    require("./reconnect").reconnect(connect);
  });

  client.on("error", (err) => {
    console.log("🚨 ERROR:", err.message);
    logger.error(err.message);
  });
}

function stop() {
  if (client) client.destroy();
}

module.exports = { connect, stop };