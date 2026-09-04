require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env"), override: true });
const http    = require("http");
const { Server } = require("socket.io");
const express = require("express");
const cors    = require("cors");
const initSchema   = require("./models/schema");
const routes       = require("./routes");
const { reloadSchedules } = require("./jobs/scheduler.job");
const logger       = require("./utils/logger");
const { setIO }    = require("./utils/notifyDB");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: ["http://localhost:5173", "http://localhost:4000"], methods: ["GET", "POST"] },
});

const PORT = process.env.EMAIL_PORT || 4000;

app.use(cors());
app.use(express.json());
app.use("/api", routes);

app.use((err, req, res, next) => {
  logger.error(err.message);
  res.status(500).json({ success: false, message: err.message });
});

io.on("connection", (socket) => {
  logger.info(`Dashboard connected: ${socket.id}`);
  socket.on("disconnect", () => logger.info(`Dashboard disconnected: ${socket.id}`));
});

async function start() {
  // Listen on port FIRST so the proxy/dashboard can connect immediately
  await new Promise((resolve) => {
    server.listen(PORT, () => {
      logger.info(`TCP-Email API running on port ${PORT}`);
      resolve();
    });
  });

  // Run schema migrations and schedule loading after port is open
  // This prevents ECONNREFUSED errors in the dashboard proxy during startup
  try {
    await initSchema();
    await reloadSchedules();
    setIO(io);
    logger.info("TCP-Email initialization complete.");
  } catch (err) {
    logger.error(`TCP-Email initialization error: ${err.message}`);
  }
}

start();
