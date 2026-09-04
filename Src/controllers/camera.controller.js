const Camera = require("../models/camera.model");
const tcpService = require("../services/tcpServer.service");

async function getAll(req, res) {
  try {
    const [rows] = await Camera.getAll();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function create(req, res) {
  try {
    const { camera_name, ip_address, port, is_active } = req.body;
    if (!camera_name || !ip_address || !port)
      return res.status(400).json({ error: "camera_name, ip_address, port are required" });

    const [result] = await Camera.create({ camera_name, ip_address, port, is_active });
    const [rows] = await Camera.getById(result.insertId);
    const cam = rows[0];

    if (cam.is_active) tcpService.startServer(cam);

    res.status(201).json(cam);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ error: "IP + Port combination already exists" });
    res.status(500).json({ error: err.message });
  }
}

async function update(req, res) {
  try {
    const { id } = req.params;
    const { camera_name, ip_address, port, is_active } = req.body;

    const [existing] = await Camera.getById(id);
    if (!existing[0]) return res.status(404).json({ error: "Not found" });

    await Camera.update(id, { camera_name, ip_address, port, is_active });
    const [rows] = await Camera.getById(id);
    const cam = rows[0];

    // Restart the TCP listener for this camera
    tcpService.restartServer(existing[0], cam);

    res.json(cam);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ error: "IP + Port combination already exists" });
    res.status(500).json({ error: err.message });
  }
}

async function remove(req, res) {
  try {
    const { id } = req.params;
    const [existing] = await Camera.getById(id);
    if (!existing[0]) return res.status(404).json({ error: "Not found" });

    await Camera.delete(id);
    tcpService.stopServer(existing[0].ip_address, existing[0].port);

    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getLogs(req, res) {
  try {
    const [rows] = await Camera.getLogs(Number(req.query.limit) || 100);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getAll, create, update, remove, getLogs };
