/**
 * System health & migration check (SQLite / sql.js edition).
 *
 * 1. Runs initSchema() to create/migrate the SQLite database
 * 2. Verifies all required tables exist (no sql.js — reads SQLite file directly)
 * 3. Runs basic health queries via the app db adapter
 * 4. Spawns temporary API servers and verifies all routes respond
 *
 * NOTE: process.exit() is intentionally avoided after sql.js is loaded
 * because calling it while the WASM async handles are still alive triggers
 * an assertion crash in libuv on Windows (UV_HANDLE_CLOSING).
 * Instead we set process.exitCode and return, letting Node.js exit naturally.
 */

const path   = require("path");
const fs     = require("fs");
const http   = require("http");
const net    = require("net");
const { spawn } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(rootDir, ".env") });

const API_PORT   = Number(process.env.API_PORT)   || 4000;
const EMAIL_PORT = Number(process.env.EMAIL_PORT) || 4001;
const DB_PATH    = path.resolve(rootDir, process.env.DB_PATH || "tcp_logs.db");

const requiredTables = [
  "camera_configs", "tcp_logs", "app_settings",
  "companies", "users", "permissions", "user_permissions",
  "audit_logs", "email_schedules", "email_recipients",
  "smtp_settings", "email_logs", "system_notifications",
  "tcp_messages", "user_tcp_configs",
];

// ── Read table names directly from SQLite file (no library needed) ──────────
function readTablesFromSqliteFile(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    const magic = "SQLite format 3\0";
    for (let i = 0; i < magic.length; i++) {
      if (buf[i] !== magic.charCodeAt(i)) return null;
    }
    const pageSize  = buf.readUInt16BE(16);
    const pageType  = buf[100];
    if (pageType !== 0x0D) return null;

    const cellCount = buf.readUInt16BE(103);
    const tables    = [];

    for (let i = 0; i < cellCount; i++) {
      const cellOffset = buf.readUInt16BE(108 + i * 2);
      if (cellOffset < 100 || cellOffset >= pageSize) continue;
      try {
        let pos = cellOffset;
        // skip payload-length varint
        while (pos < buf.length && (buf[pos++] & 0x80)) {}
        // skip rowid varint
        while (pos < buf.length && (buf[pos++] & 0x80)) {}

        const headerStart = pos;
        let headerSize = 0, hs = 0;
        while (pos < buf.length) {
          const b = buf[pos++];
          headerSize |= (b & 0x7f) << hs;
          if (!(b & 0x80)) break;
          hs += 7;
        }
        const serialTypes = [];
        while (pos < headerStart + headerSize) {
          let st = 0, ss = 0;
          while (pos < buf.length) {
            const b = buf[pos++];
            st |= (b & 0x7f) << ss;
            if (!(b & 0x80)) break;
            ss += 7;
          }
          serialTypes.push(st);
        }
        const values = [];
        for (const st of serialTypes) {
          if      (st === 0)                  { values.push(null); }
          else if (st === 1)                  { values.push(buf[pos]); pos += 1; }
          else if (st === 2)                  { values.push(buf.readInt16BE(pos)); pos += 2; }
          else if (st === 3)                  { values.push(buf.readIntBE(pos, 3)); pos += 3; }
          else if (st === 4)                  { values.push(buf.readInt32BE(pos)); pos += 4; }
          else if (st === 6)                  { values.push(buf.readInt32BE(pos)); pos += 8; }
          else if (st === 8)                  { values.push(0); }
          else if (st === 9)                  { values.push(1); }
          else if (st >= 13 && st % 2 === 1)  {
            const len = (st - 13) >> 1;
            values.push(buf.slice(pos, pos + len).toString("utf8"));
            pos += len;
          } else if (st >= 12 && st % 2 === 0) {
            pos += (st - 12) >> 1;
            values.push(null);
          } else { values.push(null); }
        }
        if (values[0] === "table" && typeof values[1] === "string") {
          tables.push(values[1].toLowerCase());
        }
      } catch (_) { /* skip malformed cell */ }
    }
    return tables;
  } catch (_) {
    return null;
  }
}

// ── HTTP / port helpers ──────────────────────────────────────────────────────
function makeRequest(url, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname, port: u.port,
      path: u.pathname + u.search, method,
      headers: { "Content-Type": "application/json" },
    };
    if (body) opts.headers["Content-Length"] = Buffer.byteLength(JSON.stringify(body));
    const req = http.request(opts, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end",  () => resolve({ statusCode: res.statusCode, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function isPortOpen(port) {
  return new Promise(resolve => {
    const s = new net.Socket();
    s.setTimeout(500);
    s.on("connect", () => { s.destroy(); resolve(true);  });
    s.on("timeout", () => { s.destroy(); resolve(false); });
    s.on("error",   () => { s.destroy(); resolve(false); });
    s.connect(port, "localhost");
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  console.log("============================================================");
  console.log("               SYSTEM HEALTH & MIGRATION CHECK              ");
  console.log("============================================================");
  console.log(`[Config] SQLite DB:  ${DB_PATH}`);
  console.log(`[Config] API Port:   ${API_PORT}`);
  console.log(`[Config] Email Port: ${EMAIL_PORT}`);
  console.log("------------------------------------------------------------");

  // 1. Run migrations (creates / updates tcp_logs.db)
  console.log("1. Running Schema Migrations (SQLite)...");
  try {
    const initSchema = require("../TCP-Email/src/models/schema");
    await initSchema();
    console.log("   ✓ Migrations completed successfully.");
  } catch (err) {
    console.error("   [ERROR] Migration failed:", err.message);
    process.exitCode = 1;
    return;
  }

  // 2. Verify tables — use sql.js to reliably read sqlite_master (same adapter used by migrations)
  console.log("2. Verifying Required Database Tables...");
  let existingTables = [];
  try {
    const db = require("../TCP-Email/src/config/db");
    const [tableRows] = await db.query(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    existingTables = tableRows.map(r => r.name.toLowerCase());
  } catch (err) {
    console.error("   [ERROR] Could not query database tables:", err.message);
    process.exitCode = 1;
    return;
  }

  let missingCount = 0;
  requiredTables.forEach(t => {
    if (existingTables.includes(t.toLowerCase())) {
      console.log(`   ✓ Table [${t}] exists`);
    } else {
      console.error(`   [MISSING] Table [${t}]`);
      missingCount++;
    }
  });
  if (missingCount > 0) {
    console.error(`   [ERROR] ${missingCount} required table(s) are missing!`);
    process.exitCode = 1;
    return;
  }
  console.log(`   ✓ All ${requiredTables.length} required tables verified.`);

  // 3. Health checks (uses the app's own db adapter — sql.js already loaded here)
  console.log("3. Running Database Health Checks...");
  try {
    const db = require("../TCP-Email/src/config/db");
    const [[{ count: userCount }]]    = await db.query("SELECT COUNT(*) as count FROM users");
    const [[{ count: companyCount }]] = await db.query("SELECT COUNT(*) as count FROM companies");
    const [[{ count: permCount }]]    = await db.query("SELECT COUNT(*) as count FROM permissions");

    console.log(`   ✓ Companies:   ${companyCount}`);
    console.log(`   ✓ Permissions: ${permCount}`);
    console.log(`   ✓ Users:       ${userCount}`);

    if (Number(userCount) === 0) {
      console.warn("   [WARNING] No users found!");
    } else {
      const [admins] = await db.query("SELECT email FROM users WHERE role = 'Super Admin' LIMIT 1");
      if (admins.length > 0) console.log(`   ✓ Super Admin: ${admins[0].email}`);
      else console.warn("   [WARNING] Super Admin not found!");
    }
  } catch (err) {
    console.error("   [ERROR] Health check failed:", err.message);
    process.exitCode = 1;
    return;
  }

  // 4. Route verification — spawn child servers and hit their routes
  console.log("4. Verifying API Routes...");

  if (await isPortOpen(API_PORT)) {
    console.error(`   [ERROR] Port ${API_PORT} already in use.`);
    process.exitCode = 1;
    return;
  }
  if (await isPortOpen(EMAIL_PORT)) {
    console.error(`   [ERROR] Port ${EMAIL_PORT} already in use.`);
    process.exitCode = 1;
    return;
  }

  const apiProc   = spawn("node", ["app.js"],     { cwd: rootDir,                         env: { ...process.env } });
  const emailProc = spawn("node", ["src/app.js"], { cwd: path.join(rootDir, "TCP-Email"), env: { ...process.env } });

  let processError = false;
  apiProc.on("error",   e => { console.error(`   [ERROR] Main API: ${e.message}`);  processError = true; });
  emailProc.on("error", e => { console.error(`   [ERROR] TCP-Email: ${e.message}`); processError = true; });

  let apiStarted = false, emailStarted = false;
  for (let i = 0; i < 40; i++) {
    if (!apiStarted)   apiStarted   = await isPortOpen(API_PORT);
    if (!emailStarted) emailStarted = await isPortOpen(EMAIL_PORT);
    if (apiStarted && emailStarted) break;
    if (processError) break;
    await new Promise(r => setTimeout(r, 500));
  }

  if (!apiStarted || !emailStarted) {
    console.error(`   [ERROR] Servers did not start. API:${apiStarted} Email:${emailStarted}`);
    apiProc.kill(); emailProc.kill();
    process.exitCode = 1;
    return;
  }

  const mainRoutes = [
    { method: "GET",  path: "/api/cameras" },
    { method: "GET",  path: "/api/statuses" },
    { method: "GET",  path: "/api/migrate" },
    { method: "POST", path: "/api/migrate" },
    { method: "GET",  path: "/api/tcp-client-config" },
    { method: "PUT",  path: "/api/tcp-client-config" },
    { method: "POST", path: "/api/tcp-client-config/disconnect" },
    { method: "POST", path: "/api/tcp-client-config/reconnect" },
  ];

  const emailRoutes = [
    { method: "POST", path: "/api/auth/login",                      body: {} },
    { method: "GET",  path: "/api/auth/me" },
    { method: "GET",  path: "/api/companies" },
    { method: "POST", path: "/api/companies",                       body: {} },
    { method: "GET",  path: "/api/users" },
    { method: "GET",  path: "/api/schedules" },
    { method: "GET",  path: "/api/emails" },
    { method: "GET",  path: "/api/email-logs" },
    { method: "GET",  path: "/api/dashboard/stats" },
    { method: "GET",  path: "/api/dashboard/charts/messages-trend" },
    { method: "GET",  path: "/api/dashboard/charts/email-status" },
    { method: "GET",  path: "/api/notifications" },
    { method: "GET",  path: "/api/notifications/unread-count" },
    { method: "GET",  path: "/api/settings/smtp" },
  ];

  let routeFailures = 0;
  async function testRoutes(routes, port, label) {
    for (const r of routes) {
      try {
        const res = await makeRequest(`http://localhost:${port}${r.path}`, r.method, r.body);
        if (res.statusCode === 404 && res.body.includes(`Cannot ${r.method}`)) {
          console.error(`     [FAIL] [${label}] ${r.method} ${r.path} → not registered`);
          routeFailures++;
        } else {
          console.log(`     ✓ [${label}] ${r.method} ${r.path} → HTTP ${res.statusCode}`);
        }
      } catch (err) {
        console.error(`     [FAIL] [${label}] ${r.method} ${r.path} → ${err.message}`);
        routeFailures++;
      }
    }
  }

  await testRoutes(mainRoutes,  API_PORT,   "Main API");
  await testRoutes(emailRoutes, EMAIL_PORT, "Email API");

  apiProc.kill("SIGINT");
  emailProc.kill("SIGINT");

  console.log("------------------------------------------------------------");
  if (routeFailures > 0) {
    console.error(`[ERROR] ${routeFailures} route failure(s) detected.`);
    process.exitCode = 1;
    return;
  }

  console.log("============================================================");
  console.log("              ALL CHECKS & VERIFICATION PASSED              ");
  console.log("============================================================");
  // No process.exit() — let Node.js exit naturally once all handles close.
  // This avoids the libuv UV_HANDLE_CLOSING assertion caused by sql.js WASM handles.
}

run().catch(err => {
  console.error("Unhandled exception:", err);
  process.exitCode = 1;
});
