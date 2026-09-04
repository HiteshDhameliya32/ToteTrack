const router = require("express").Router();
const jwt = require("jsonwebtoken");
const ctrl = require("../controllers/camera.controller");
const tcpClientCtrl = require("../controllers/tcpClientConfig.controller");

const JWT_SECRET = process.env.JWT_SECRET || "tcp_secret_key_123_456_789";

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    return res.status(401).json({ error: "Authentication required" });
  try {
    const decoded = jwt.verify(header.split(" ")[1], JWT_SECRET);
    req.user = { id: decoded.user_id, company_id: decoded.company_id, role: decoded.role };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Camera / TCP server listener routes
router.get("/cameras", ctrl.getAll);
router.post("/cameras", ctrl.create);
router.put("/cameras/:id", ctrl.update);
router.delete("/cameras/:id", ctrl.remove);
router.get("/logs", ctrl.getLogs);

// User-scoped TCP client config routes (auth required)
router.get("/tcp-client-config",            authenticate, tcpClientCtrl.getConfig);
router.put("/tcp-client-config",            authenticate, tcpClientCtrl.updateConfig);
router.post("/tcp-client-config/disconnect",authenticate, tcpClientCtrl.disconnect);
router.post("/tcp-client-config/reconnect", authenticate, tcpClientCtrl.reconnect);

// Zone routes
router.get("/tcp-zones",      authenticate, tcpClientCtrl.getZones);
router.post("/tcp-zones",     authenticate, tcpClientCtrl.createZone);
router.delete("/tcp-zones/:id", authenticate, tcpClientCtrl.deleteZone);

module.exports = router;
