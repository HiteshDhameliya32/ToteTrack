const router = require("express").Router();

const auth = require("../controllers/auth.controller");
const user = require("../controllers/user.controller");
const company = require("../controllers/company.controller");

const schedule = require("../controllers/schedule.controller");
const recipient = require("../controllers/recipient.controller");
const dashboard = require("../controllers/dashboard.controller");
const settings  = require("../controllers/settings.controller");
const records   = require("../controllers/records.controller");
const charts    = require("../controllers/charts.controller");
const notif     = require("../controllers/notification.controller");
const report    = require("../controllers/report.controller");

const { authenticate, authorize } = require("../middlewares/auth.middleware");

// ── Public Auth Routes ─────────────────────────────────
router.post("/auth/login", auth.login);

// ── Protected Routes (Require Authentication) ──────────
router.use(authenticate);

router.get("/auth/me", auth.me);

// ── Company Routes (Super Admin Only) ──────────────────
router.get("/companies", company.list);
router.post("/companies", company.create);

// ── User Management Routes ─────────────────────────────
router.get("/users", authorize("CREATE_USERS"), user.list);
router.post("/users", authorize("CREATE_USERS"), user.create);
router.put("/users/:id", authorize("EDIT_USERS"), user.update);
router.delete("/users/:id", authorize("DELETE_USERS"), user.remove);
router.get("/users/:id/permissions", authorize("EDIT_USERS"), user.getPermissions);
router.put("/users/:id/permissions", authorize("EDIT_USERS"), user.updatePermissions);

// ── Schedules Routes ───────────────────────────────────
router.get("/schedules", authorize("MANAGE_SCHEDULES"), schedule.list);
router.post("/schedules", authorize("MANAGE_SCHEDULES"), schedule.create);
router.put("/schedules/:id", authorize("MANAGE_SCHEDULES"), schedule.update);
router.delete("/schedules/:id", authorize("MANAGE_SCHEDULES"), schedule.remove);

// ── Recipients Routes ──────────────────────────────────
router.get("/emails", authorize("MANAGE_RECIPIENTS"), recipient.list);
router.post("/emails", authorize("MANAGE_RECIPIENTS"), recipient.create);
router.put("/emails/:id", authorize("MANAGE_RECIPIENTS"), recipient.update);
router.delete("/emails/:id", authorize("MANAGE_RECIPIENTS"), recipient.remove);

// ── Email Logs Routes ──────────────────────────────────
router.get("/email-logs", authorize("VIEW_EMAIL_LOGS"), dashboard.logs);
router.post("/email-logs/send-now", authorize("SEND_EMAIL"), dashboard.sendNow);

// ── Dashboard & Charts Routes ──────────────────────────
router.get("/dashboard/stats",                    authorize("VIEW_DASHBOARD"), dashboard.dashboardStats);
router.get("/dashboard/enhanced-stats",           authorize("VIEW_DASHBOARD"), charts.enhancedStats);
router.get("/dashboard/charts/messages-trend",    authorize("VIEW_DASHBOARD"), charts.messagesTrend);
router.get("/dashboard/charts/email-status",      authorize("VIEW_DASHBOARD"), charts.emailStatus);
router.get("/dashboard/charts/daily-records",     authorize("VIEW_DASHBOARD"), charts.dailyRecords);
router.get("/dashboard/charts/email-history",     authorize("VIEW_DASHBOARD"), charts.emailHistory);
router.get("/dashboard/charts/busy-hours",        authorize("VIEW_DASHBOARD"), charts.busyHours);
router.get("/dashboard/charts/zone-breakdown",    authorize("VIEW_DASHBOARD"), charts.zoneBreakdown);

// ── Reports Routes ─────────────────────────────────────
router.get("/reports/preview",  authorize("VIEW_RECORDS"), report.preview);
router.get("/reports/download", authorize("VIEW_RECORDS"), report.download);
router.post("/reports/email",   authorize("VIEW_RECORDS"), report.sendEmail);

// ── Pending Messages & Records Routes ──────────────────
router.get("/messages/pending", authorize("VIEW_RECORDS"), dashboard.pending);
router.get("/records", authorize("VIEW_RECORDS"), dashboard.records);
router.get("/records/recent", authorize("VIEW_RECORDS"), dashboard.recentRecords);
router.get("/records/zone-folder", authorize("VIEW_RECORDS"), dashboard.getZoneFolderPath);
router.post("/records/send-selected", authorize("SEND_EMAIL"), records.sendSelected);
router.post("/records/send-filtered", authorize("SEND_EMAIL"), records.sendFiltered);

// ── SMTP Settings Routes ───────────────────────────────
router.get("/settings/smtp", authorize("MANAGE_SETTINGS"), settings.get);
router.put("/settings/smtp", authorize("MANAGE_SETTINGS"), settings.update);
router.post("/settings/test-email", authorize("MANAGE_SETTINGS"), settings.testEmail);

// ── Notifications Routes ───────────────────────────────
router.get("/notifications",             authorize("VIEW_NOTIFICATIONS"), notif.list);
router.get("/notifications/unread-count", authorize("VIEW_NOTIFICATIONS"), notif.unreadCount);
router.put("/notifications/read-all",     authorize("VIEW_NOTIFICATIONS"), notif.markAllRead);
router.put("/notifications/:id/read",     authorize("VIEW_NOTIFICATIONS"), notif.markRead);

// ── TCP Client Config & Zones (Dual Mount for Proxy Resiliency) ──
const tcpClientCtrl = require("../../../Src/controllers/tcpClientConfig.controller");
router.get("/tcp-client-config",            tcpClientCtrl.getConfig);
router.put("/tcp-client-config",            tcpClientCtrl.updateConfig);
router.post("/tcp-client-config/disconnect",tcpClientCtrl.disconnect);
router.post("/tcp-client-config/reconnect", tcpClientCtrl.reconnect);

router.get("/tcp-zones",      tcpClientCtrl.getZones);
router.post("/tcp-zones",     tcpClientCtrl.createZone);
router.delete("/tcp-zones/:id", tcpClientCtrl.deleteZone);

// ── Device connection status — proxies to TCP-Node (port 8001) ───────────
router.get("/devices/status", authenticate, async (req, res, next) => {
  try {
    const http    = require("http");
    const tcpPort = process.env.API_PORT || 8001;
    const data    = await new Promise((resolve, reject) => {
      http.get(`http://localhost:${tcpPort}/api/devices/status`, (r) => {
        let body = "";
        r.on("data", c => body += c);
        r.on("end", () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(e); }
        });
      }).on("error", reject);
    });
    res.json(data);
  } catch (err) { next(err); }
});

// Serve matched TCP images (OK or NR folders)
router.get("/tcp-image", (req, res) => {
  const { file, folder } = req.query;
  if (!file || !folder) return res.status(400).end();
  const pathMod = require("path");
  const resolved = pathMod.resolve(folder, file);
  if (!resolved.startsWith(pathMod.resolve(folder))) return res.status(403).end();
  res.sendFile(resolved, (err) => { if (err) res.status(404).end(); });
});

module.exports = router;


