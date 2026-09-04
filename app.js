const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "./.env"), override: true });

const http = require("http");
const express = require("express");
const cors = require("cors");
const { Server } = require("socket.io");

const logger      = require("./Src/services/logger");
const tcpService  = require("./Src/services/tcpServer.service");
const tcpClient   = require("./Src/client/client");
const cameraRoutes  = require("./Src/routes/camera.routes");
const migrateRoute  = require("./Src/routes/migrate.routes");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// Serve matched TCP images from any absolute folder path on disk
// e.g. GET /api/tcp-image?file=ABC123.jpg&folder=C:/images
app.get("/api/tcp-image", (req, res) => {
  let { file, folder } = req.query;
  if (!file || !folder) return res.status(400).end();
  
  // Remove surrounding quotes that might have been saved in DB
  folder = folder.trim().replace(/^["']|["']$/g, '');
  file = file.trim().replace(/^["']|["']$/g, '');

  const pathMod = require("path");
  const fs = require("fs");
  
  try {
    // Try exact match first
    let resolved = pathMod.resolve(folder, file);
    if (!resolved.startsWith(pathMod.resolve(folder))) return res.status(403).end();
    
    if (fs.existsSync(resolved)) {
      return res.sendFile(resolved, (err) => { if (err) res.status(404).end(); });
    }
    
    // If exact match fails, try matching by name without extension
    const files = fs.readdirSync(pathMod.resolve(folder));
    const fileName = pathMod.parse(file).name.toLowerCase();
    
    const match = files.find(f => {
      const fName = pathMod.parse(f).name.toLowerCase();
      const fFullName = f.toLowerCase();
      return fName === fileName || fFullName === file.toLowerCase();
    });
    
    if (match) {
      resolved = pathMod.resolve(folder, match);
      if (!resolved.startsWith(pathMod.resolve(folder))) return res.status(403).end();
      return res.sendFile(resolved, (err) => { if (err) res.status(404).end(); });
    }
    
    res.status(404).end();
  } catch (err) {
    res.status(404).end();
  }
});

// Check if TCP image exists (returns {exists: true/false})
app.get("/api/tcp-image-check", (req, res) => {
  let { file, folder } = req.query;
  if (!file || !folder) return res.status(400).json({ exists: false });
  
  // Remove surrounding quotes that might have been saved in DB
  folder = folder.trim().replace(/^["']|["']$/g, '');
  file = file.trim().replace(/^["']|["']$/g, '');

  const fs = require("fs");
  const pathMod = require("path");
  
  try {
    const resolved = pathMod.resolve(folder);
    
    // Check if folder exists
    if (!fs.existsSync(resolved)) {
      return res.json({ exists: false });
    }
    
    // Try exact match first
    const exactPath = pathMod.resolve(folder, file);
    if (fs.existsSync(exactPath)) {
      return res.json({ exists: true, matched: file });
    }
    
    // If exact match fails, try matching by name without extension (like findMatchingImage)
    const files = fs.readdirSync(resolved);
    const fileName = pathMod.parse(file).name.toLowerCase();
    
    const match = files.find(f => {
      const fName = pathMod.parse(f).name.toLowerCase();
      const fFullName = f.toLowerCase();
      return fName === fileName || fFullName === file.toLowerCase();
    });
    
    if (match) {
      return res.json({ exists: true, matched: match });
    }
    
    res.json({ exists: false });
  } catch (err) {
    res.json({ exists: false });
  }
});

app.use("/api", cameraRoutes);
app.use("/api", migrateRoute);
app.get("/api/statuses", (_req, res) => res.json(tcpService.getStatuses()));

// ── Device connection status — called by TCP-Email dashboard ──────────────
app.get("/api/devices/status", async (_req, res) => {
  try {
    const data = await tcpClient.getConnectionStatus();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

io.on("connection", (socket) => {
  socket.emit("init_statuses", tcpService.getStatuses());
});

tcpService.setIO(io);

const API_PORT = Number(process.env.API_PORT) || 4000;

server.listen(API_PORT, async () => {
  logger.info(`API + Socket.IO server running on port ${API_PORT}`);
  console.log(`🚀 TCP-Node API running on http://localhost:${API_PORT}`);

  await tcpService.startAll();
  await tcpClient.loadAll();
});

process.on("SIGINT", () => {
  logger.info("APPLICATION STOPPED");
  tcpClient.stopAll();
  process.exit();
});
