const net = require("net");
const Camera = require("../models/camera.model");
const logger = require("../services/logger");

function getKolkataTimeStr(date = new Date()) {
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
  const parts = formatter.formatToParts(date);
  const getPart = (type) => parts.find(p => p.type === type).value;
  return `${getPart("year")}-${getPart("month")}-${getPart("day")} ${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;
}

// key: "ip:port" -> { server: net.Server, camera, clients: Set, lastMessage, lastActivity, status }
const servers = new Map();

let _io = null; // Socket.IO instance injected at startup

function setIO(io) {
  _io = io;
}

function key(ip, port) {
  return `${ip}:${port}`;
}

function startServer(camera) {
  const k = key(camera.ip_address, camera.port);
  if (servers.has(k)) {
    logger.info(`TCP server already running on ${k}`);
    return;
  }

  const state = {
    camera,
    clients: new Set(),
    lastMessage: null,
    lastActivity: null,
    status: "listening",
  };

  const server = net.createServer((socket) => {
    state.clients.add(socket);
    state.status = "connected";
    logger.info(`[${camera.camera_name}] Client connected from ${socket.remoteAddress}`);
    emitStatus(k, state);

    socket.on("data", async (data) => {
      const text = data.toString().trim();
      if (!text) return;

      state.lastMessage = text;
      state.lastActivity = getKolkataTimeStr();
      state.status = "connected";

      console.log(`[${camera.camera_name}][${camera.port}] ${text}`);
      logger.info(`[${camera.camera_name}][${camera.port}] ${text}`);

      try {
        await Camera.saveLog({
          camera_id: camera.id,
          ip_address: camera.ip_address,
          port: camera.port,
          message: text,
        });

        const logEntry = {
          camera_id: camera.id,
          camera_name: camera.camera_name,
          ip_address: camera.ip_address,
          port: camera.port,
          message: text,
          received_at: state.lastActivity,
        };

        if (_io) {
          _io.emit("tcp_log", logEntry);
          emitStatus(k, state);
        }
      } catch (err) {
        logger.error(`DB save error: ${err.message}`);
      }
    });

    socket.on("close", () => {
      state.clients.delete(socket);
      if (state.clients.size === 0) state.status = "listening";
      emitStatus(k, state);
    });

    socket.on("error", (err) => logger.error(`[${camera.camera_name}] socket error: ${err.message}`));
  });

  server.listen(camera.port, () => {
    logger.info(`TCP listener started on port ${camera.port} for ${camera.camera_name}`);
    console.log(`🟢 TCP listening on ${k} [${camera.camera_name}]`);
  });

  server.on("error", (err) => {
    logger.error(`TCP server error on ${k}: ${err.message}`);
    state.status = "error";
    emitStatus(k, state);
  });

  state.server = server;
  servers.set(k, state);
}

function stopServer(ip, port) {
  const k = key(ip, port);
  const state = servers.get(k);
  if (!state) return;

  state.clients.forEach((s) => s.destroy());
  state.server.close(() => {
    logger.info(`TCP listener stopped on ${k}`);
    console.log(`🔴 TCP stopped on ${k}`);
  });
  servers.delete(k);

  if (_io) _io.emit("server_stopped", { ip_address: ip, port });
}

function restartServer(oldCamera, newCamera) {
  stopServer(oldCamera.ip_address, oldCamera.port);
  if (newCamera.is_active) {
    // Small delay to let OS release the port
    setTimeout(() => startServer(newCamera), 500);
  }
}

async function startAll() {
  try {
    const [cameras] = await Camera.getActive();
    cameras.forEach((cam) => startServer(cam));
    logger.info(`Started ${cameras.length} TCP server(s)`);
  } catch (err) {
    logger.error(`Failed to start TCP servers: ${err.message}`);
  }
}

function getStatuses() {
  const result = [];
  for (const [k, state] of servers.entries()) {
    result.push({
      key: k,
      camera_id: state.camera.id,
      camera_name: state.camera.camera_name,
      ip_address: state.camera.ip_address,
      port: state.camera.port,
      status: state.status,
      lastMessage: state.lastMessage,
      lastActivity: state.lastActivity,
      clients: state.clients.size,
    });
  }
  return result;
}

function emitStatus(k, state) {
  if (!_io) return;
  _io.emit("server_status", {
    key: k,
    camera_id: state.camera.id,
    camera_name: state.camera.camera_name,
    ip_address: state.camera.ip_address,
    port: state.camera.port,
    status: state.status,
    lastMessage: state.lastMessage,
    lastActivity: state.lastActivity,
    clients: state.clients.size,
  });
}

module.exports = { setIO, startAll, startServer, stopServer, restartServer, getStatuses };
