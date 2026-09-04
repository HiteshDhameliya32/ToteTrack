/**
 * test-pairing.js  (v2 - in-process mock-server approach)
 *
 * Tests the 30ms pairing logic by loading client.js IN-PROCESS and acting as
 * a mock TCP server that client.js connects to.
 *
 * Architecture:
 *   client.js opens OUTGOING connections to host:port in user_tcp_configs.
 *   This script creates real local TCP servers on free ports, temporarily inserts
 *   test rows into the DB pointing at 127.0.0.1:<free-port>, loads the client,
 *   waits for connection, then PUSHES data from the mock server side to trigger
 *   socket.on("data") inside client.js.
 *
 * Scenarios:
 *   [1] Both barcode simultaneously     -> expect 2 records
 *   [2] A=barcode B=NR simultaneously   -> expect 1 record
 *   [3] A=NR B=barcode simultaneously   -> expect 1 record
 *   [4] Both NR simultaneously          -> expect 1 record
 *   [5] Only A pushes (unpaired)        -> expect 1 record
 *   [6] A pushes, B pushes >window ms later -> expect 2 records
 *
 * Usage:
 *   node scripts/test-pairing.js
 *   node scripts/test-pairing.js --window=100
 */

"use strict";

const net  = require("net");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(rootDir, ".env") });

const MATCHING_WINDOW = Number(
  process.argv.find((a) => a.startsWith("--window="))?.split("=")[1] ||
  process.env.TCP_MATCHING_WINDOW || 30
);
const LATE_DELAY = Math.max(MATCHING_WINDOW * 3, 100);

// Use same db as main app so writes are visible to client.js
const db = require(path.join(rootDir, "Src/config/db"));

async function getLastId() {
  const [rows] = await db.execute("SELECT MAX(id) as m FROM tcp_messages");
  return rows[0]?.m ?? 0;
}

async function countAfter(lastId) {
  const [rows] = await db.execute(
    "SELECT COUNT(*) as c FROM tcp_messages WHERE id > ?",
    [lastId]
  );
  return rows[0]?.c ?? 0;
}

function kolkataTimeStr(d = new Date()) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const p = Object.fromEntries(f.formatToParts(d).map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Create a local mock TCP server. Returns { port, push(msg), close() }
function createMockServer() {
  return new Promise((resolve, reject) => {
    const clients = new Set();
    const server  = net.createServer((sock) => {
      clients.add(sock);
      sock.on("close", () => clients.delete(sock));
      sock.on("error", () => clients.delete(sock));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        port,
        push(msg) {
          for (const s of clients) {
            if (!s.destroyed) s.write(msg + "\r\n");
          }
        },
        close() {
          for (const s of clients) try { s.destroy(); } catch (_) {}
          server.close();
        },
      });
    });
    server.on("error", reject);
  });
}

const TEST_USER_ID = 99999;
const TEST_ZONE_ID = 99999;

async function setupTestPair(portA, portB) {
  await db.execute("DELETE FROM user_tcp_configs WHERE user_id = ?", [TEST_USER_ID]);
  await db.execute(
    `INSERT OR REPLACE INTO user_tcp_configs
       (user_id, host, port, zone_id, is_active, folder_path_ok, folder_path_nr)
     VALUES (?, '127.0.0.1', ?, ?, 1, NULL, NULL)`,
    [TEST_USER_ID, portA, TEST_ZONE_ID]
  );
  await db.execute(
    `INSERT OR REPLACE INTO user_tcp_configs
       (user_id, host, port, zone_id, is_active, folder_path_ok, folder_path_nr)
     VALUES (?, '127.0.0.1', ?, ?, 1, NULL, NULL)`,
    [TEST_USER_ID, portB, TEST_ZONE_ID]
  );
}

async function cleanupTestPair() {
  await db.execute("DELETE FROM user_tcp_configs WHERE user_id = ?", [TEST_USER_ID]);
}

let passed = 0, failed = 0;

function result(label, ok, detail = "") {
  if (ok) { passed++; console.log(`  PASS  ${label}  [${detail}]`); }
  else     { failed++; console.log(`  FAIL  ${label}  [${detail}]`); }
}

async function scenario(label, expectCount, fn) {
  const settle = Math.max(MATCHING_WINDOW * 6, 400);
  const lastId = await getLastId();   // snapshot before test
  await fn();
  await sleep(settle);
  const saved = await countAfter(lastId);  // only rows added THIS scenario
  result(label, saved === expectCount, `saved=${saved} expect=${expectCount}`);
}

async function runTests() {
  const srvA = await createMockServer();
  const srvB = await createMockServer();
  console.log(`\nMock servers: A=127.0.0.1:${srvA.port}  B=127.0.0.1:${srvB.port}`);
  console.log(`Matching window: ${MATCHING_WINDOW}ms  Late delay: ${LATE_DELAY}ms\n`);

  await setupTestPair(srvA.port, srvB.port);

  const tcpClient = require(path.join(rootDir, "Src/client/client"));
  await tcpClient.loadAndConnectUser(TEST_USER_ID);
  await sleep(300); // wait for client to connect to mock servers

  console.log(`${"─".repeat(60)}`);

  // [1] Both barcode simultaneously -> 2 records
  await scenario("[1] Both barcode simultaneous    -> expect 2", 2, async () => {
    const t = Date.now();
    srvA.push(`ITEM_A|BC_${t}`);
    srvB.push(`ITEM_B|BC_${t + 1}`);
  });

  // [2] A=barcode B=NR simultaneous -> 1 record
  await scenario("[2] A=barcode B=NR simultaneous  -> expect 1", 1, async () => {
    const t = Date.now();
    srvA.push(`ITEM_A|BC_${t}`);
    srvB.push(`ITEM_B|NR`);
  });

  // [3] A=NR B=barcode simultaneous -> 1 record
  await scenario("[3] A=NR B=barcode simultaneous  -> expect 1", 1, async () => {
    const t = Date.now();
    srvA.push(`ITEM_A|NR`);
    srvB.push(`ITEM_B|BC_${t}`);
  });

  // [4] Both NR simultaneous -> 1 record
  await scenario("[4] Both NR simultaneous         -> expect 1", 1, async () => {
    srvA.push(`ITEM_A|NR`);
    srvB.push(`ITEM_B|NR`);
  });

  // [5] Only A sends (unpaired) -> 1 record
  await scenario("[5] Only A sends (unpaired)      -> expect 1", 1, async () => {
    srvA.push(`ITEM_A|BC_${Date.now()}`);
  });

  // [6] A sends, B sends LATE_DELAY ms later -> 2 records (both unpaired)
  await scenario(`[6] A early, B late (${LATE_DELAY}ms)      -> expect 2`, 2, async () => {
    srvA.push(`ITEM_A|BC_${Date.now()}`);
    await sleep(LATE_DELAY);
    srvB.push(`ITEM_B|BC_${Date.now()}`);
  });

  tcpClient.logoutUser(TEST_USER_ID);
  await cleanupTestPair();
  srvA.close();
  srvB.close();
}

async function main() {
  console.log("=".repeat(60));
  console.log("  TCP PAIR-MATCHING TEST SUITE (in-process mock server)");
  console.log(`  Matching window: ${MATCHING_WINDOW}ms`);
  console.log("=".repeat(60));

  try {
    await runTests();
  } catch (e) {
    console.error("\nTest error:", e.message);
    console.error(e.stack);
    process.exit(1);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULTS   PASS: ${passed}   FAIL: ${failed}`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.log(`\n  Tip: try a larger window: node scripts/test-pairing.js --window=100`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("Unhandled:", e); process.exit(1); });
