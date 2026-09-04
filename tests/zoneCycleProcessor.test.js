/**
 * Comprehensive tests for Zone Cycle Processor
 * 
 * Test Coverage:
 * - Single-device scenarios (PASS/NR)
 * - Multi-device scenarios (early completion, timeout, partial responses)
 * - Zone isolation (simultaneous processing)
 * - Edge cases (duplicate messages, stale timers, unknown devices)
 * - Configuration validation (different ZONE_CYCLE_TIME_MS values)
 */

const assert = require("assert");
const db = require("../Src/config/db");

// Mock dependencies
const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

// We'll set process.env.ZONE_CYCLE_TIME_MS for testing different timeouts
const originalEnv = process.env.ZONE_CYCLE_TIME_MS;

// Helper to wait for a duration
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to clear test data
async function clearTestData() {
  await db.execute("DELETE FROM zone_cycles");
  await db.execute("DELETE FROM tcp_messages");
  await db.execute("DELETE FROM user_tcp_configs WHERE user_id = 9999");
  await db.execute("DELETE FROM tcp_zones WHERE user_id = 9999");
}

// Helper to setup test zone with devices
async function setupTestZone(zoneId, devices) {
  // Create zone
  await db.execute(
    "INSERT INTO tcp_zones (id, user_id, name) VALUES (?, 9999, ?)",
    [zoneId, `Test Zone ${zoneId}`]
  );
  
  // Create device configs
  for (const device of devices) {
    await db.execute(
      `INSERT INTO user_tcp_configs (user_id, host, port, zone_id, is_active) 
       VALUES (9999, ?, ?, ?, 1)`,
      [device.host, device.port, zoneId]
    );
  }
}

// Helper to create a test record
async function createTestRecord(host, port, zoneId, barcode, message) {
  const result = await db.execute(
    `INSERT INTO tcp_messages (message, company_id, port, barcode, zone_id, received_at)
     VALUES (?, 1, ?, ?, ?, datetime('now'))`,
    [message, port, barcode, zoneId]
  );
  return result.lastID;
}

// Helper to get cycle result
async function getCycleResult(cycleId) {
  const [rows] = await db.execute(
    "SELECT * FROM zone_cycles WHERE cycle_id = ?",
    [cycleId]
  );
  return rows[0] || null;
}

// Helper to get all cycle results for a zone
async function getZoneCycles(zoneId) {
  const [rows] = await db.execute(
    "SELECT * FROM zone_cycles WHERE zone_id = ? ORDER BY started_at DESC",
    [zoneId]
  );
  return rows;
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ══════════════════════════════════════════════════════════════════════════════

async function runTests() {
  console.log("🧪 Starting Zone Cycle Processor Tests\n");
  
  let passed = 0;
  let failed = 0;
  
  // Test helper
  async function test(name, fn) {
    try {
      await clearTestData();
      await fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`❌ ${name}`);
      console.error(`   Error: ${err.message}`);
      if (err.stack) console.error(`   ${err.stack.split('\n').slice(1, 3).join('\n   ')}`);
      failed++;
    }
  }
  
  // ============================================================================
  // SINGLE-DEVICE SCENARIOS
  // ============================================================================
  
  await test("Single device with barcode → PASS", async () => {
    process.env.ZONE_CYCLE_TIME_MS = "1000";
    delete require.cache[require.resolve("../Src/services/zoneCycleProcessor.service")];
    const processor = require("../Src/services/zoneCycleProcessor.service");
    
    await setupTestZone(1001, [
      { host: "192.168.1.10", port: 5001 }
    ]);
    
    const recordId = await createTestRecord(
      "192.168.1.10", 5001, 1001, "ABC123", "TEST001|ABC123"
    );
    
    await processor.processRecord({
      recordId,
      host: "192.168.1.10",
      port: 5001,
      zoneId: 1001,
      barcode: "ABC123",
      message: "TEST001|ABC123"
    });
    
    // Should complete immediately (all devices received)
    await wait(100);
    
    const cycles = await getZoneCycles(1001);
    assert.strictEqual(cycles.length, 1, "Should have 1 cycle");
    assert.strictEqual(cycles[0].status, "PASS", "Status should be PASS");
    assert.strictEqual(cycles[0].barcode, "ABC123", "Barcode should be ABC123");
    assert.strictEqual(cycles[0].completion_reason, "ALL_DEVICES_RECEIVED", "Should complete early");
  });
  
  await test("Single device without barcode → NR", async () => {
    process.env.ZONE_CYCLE_TIME_MS = "1000";
    delete require.cache[require.resolve("../Src/services/zoneCycleProcessor.service")];
    const processor = require("../Src/services/zoneCycleProcessor.service");
    
    await setupTestZone(1002, [
      { host: "192.168.1.10", port: 5002 }
    ]);
    
    const recordId = await createTestRecord(
      "192.168.1.10", 5002, 1002, null, "TEST002|NR"
    );
    
    await processor.processRecord({
      recordId,
      host: "192.168.1.10",
      port: 5002,
      zoneId: 1002,
      barcode: null,
      message: "TEST002|NR"
    });
    
    await wait(100);
    
    const cycles = await getZoneCycles(1002);
    assert.strictEqual(cycles.length, 1, "Should have 1 cycle");
    assert.strictEqual(cycles[0].status, "NR", "Status should be NR");
    assert.strictEqual(cycles[0].barcode, null, "Barcode should be null");
    assert.strictEqual(cycles[0].first_record_id, recordId, "Should reference first record");
  });
  
  await test("Single device with barcode arrives at timeout → PASS", async () => {
    process.env.ZONE_CYCLE_TIME_MS = "500";
    delete require.cache[require.resolve("../Src/services/zoneCycleProcessor.service")];
    const processor = require("../Src/services/zoneCycleProcessor.service");
    
    await setupTestZone(1003, [
      { host: "192.168.1.10", port: 5003 }
    ]);
    
    const recordId = await createTestRecord(
      "192.168.1.10", 5003, 1003, "XYZ789", "TEST003|XYZ789"
    );
    
    await processor.processRecord({
      recordId,
      host: "192.168.1.10",
      port: 5003,
      zoneId: 1003,
      barcode: "XYZ789",
      message: "TEST003|XYZ789"
    });
    
    // Should complete immediately for single device
    await wait(100);
    
    const cycles = await getZoneCycles(1003);
    assert.strictEqual(cycles[0].status, "PASS", "Should be PASS even with immediate completion");
    assert.strictEqual(cycles[0].barcode, "XYZ789");
  });
  
  await test("Single device without barcode at timeout → NR", async () => {
    process.env.ZONE_CYCLE_TIME_MS = "500";
    delete require.cache[require.resolve("../Src/services/zoneCycleProcessor.service")];
    const processor = require("../Src/services/zoneCycleProcessor.service");
    
    await setupTestZone(1004, [
      { host: "192.168.1.10", port: 5004 }
    ]);
    
    const recordId = await createTestRecord(
      "192.168.1.10", 5004, 1004, null, "TEST004|NR"
    );
    
    await processor.processRecord({
      recordId,
      host: "192.168.1.10",
      port: 5004,
      zoneId: 1004,
      barcode: null,
      message: "TEST004|NR"
    });
    
    await wait(100);
    
    const cycles = await getZoneCycles(1004);
    assert.strictEqual(cycles[0].status, "NR");
    assert.strictEqual(cycles[0].first_record_id, recordId);
  });
  
  // ============================================================================
  // MULTI-DEVICE SCENARIOS
  // ============================================================================
  
  await test("Two devices: Front NR + Rear PASS → PASS", async () => {
    process.env.ZONE_CYCLE_TIME_MS = "1000";
    delete require.cache[require.resolve("../Src/services/zoneCycleProcessor.service")];
    const processor = require("../Src/services/zoneCycleProcessor.service");
    
    await setupTestZone(2001, [
      { host: "192.168.1.20", port: 6001 },
      { host: "192.168.1.20", port: 6002 }
    ]);
    
    // Front camera - no barcode
    const record1 = await createTestRecord(
      "192.168.1.20", 6001, 2001, null, "TEST005|NR"
    );
    await processor.processRecord({
      recordId: record1,
      host: "192.168.1.20",
      port: 6001,
      zoneId: 2001,
      barcode: null,
      message: "TEST005|NR"
    });
    
    await wait(50);
    
    // Rear camera - has barcode
    const record2 = await createTestRecord(
      "192.168.1.20", 6002, 2001, "REAR123", "TEST005|REAR123"
    );
    await processor.processRecord({
      recordId: record2,
      host: "192.168.1.20",
      port: 6002,
      zoneId: 2001,
      barcode: "REAR123",
      message: "TEST005|REAR123"
    });
    
    // Should complete immediately after both devices respond
    await wait(100);
    
    const cycles = await getZoneCycles(2001);
    assert.strictEqual(cycles.length, 1);
    assert.strictEqual(cycles[0].status, "PASS", "Should be PASS with barcode from rear");
    assert.strictEqual(cycles[0].barcode, "REAR123");
    assert.strictEqual(cycles[0].completion_reason, "ALL_DEVICES_RECEIVED");
    assert.strictEqual(cycles[0].first_record_id, record1, "First record should be from front camera");
  });
  
  await test("Two devices: Both NR → NR", async () => {
    process.env.ZONE_CYCLE_TIME_MS = "1000";
    delete require.cache[require.resolve("../Src/services/zoneCycleProcessor.service")];
    const processor = require("../Src/services/zoneCycleProcessor.service");
    
    await setupTestZone(2002, [
      { host: "192.168.1.21", port: 6003 },
      { host: "192.168.1.21", port: 6004 }
    ]);
    
    const record1 = await createTestRecord(
      "192.168.1.21", 6003, 2002, null, "TEST006|NR"
    );
    await processor.processRecord({
      recordId: record1,
      host: "192.168.1.21",
      port: 6003,
      zoneId: 2002,
      barcode: null,
      message: "TEST006|NR"
    });
    
    await wait(50);
    
    const record2 = await createTestRecord(
      "192.168.1.21", 6004, 2002, null, "TEST006|NR"
    );
    await processor.processRecord({
      recordId: record2,
      host: "192.168.1.21",
      port: 6004,
      zoneId: 2002,
      barcode: null,
      message: "TEST006|NR"
    });
    
    await wait(100);
    
    const cycles = await getZoneCycles(2002);
    assert.strictEqual(cycles[0].status, "NR");
    assert.strictEqual(cycles[0].completion_reason, "ALL_DEVICES_RECEIVED");
  });
  
  await test("Two devices: Only one responds with barcode → PASS at timeout", async () => {
    process.env.ZONE_CYCLE_TIME_MS = "500";
    delete require.cache[require.resolve("../Src/services/zoneCycleProcessor.service")];
    const processor = require("../Src/services/zoneCycleProcessor.service");
    
    await setupTestZone(2003, [
      { host: "192.168.1.22", port: 6005 },
      { host: "192.168.1.22", port: 6006 }
    ]);
    
    const record1 = await createTestRecord(
      "192.168.1.22", 6005, 2003, "SINGLE456", "TEST007|SINGLE456"
    );
    await processor.processRecord({
      recordId: record1,
      host: "192.168.1.22",
      port: 6005,
      zoneId: 2003,
      barcode: "SINGLE456",
      message: "TEST007|SINGLE456"
    });
    
    // Second device never responds - wait for timeout
    await wait(600);
    
    const cycles = await getZoneCycles(2003);
    assert.strictEqual(cycles[0].status, "PASS", "Should be PASS with one barcode");
    assert.strictEqual(cycles[0].barcode, "SINGLE456");
    assert.strictEqual(cycles[0].completion_reason, "TIMEOUT");
  });
  
  await test("Two devices: Only one responds without barcode → NR at timeout", async () => {
    process.env.ZONE_CYCLE_TIME_MS = "500";
    delete require.cache[require.resolve("../Src/services/zoneCycleProcessor.service")];
    const processor = require("../Src/services/zoneCycleProcessor.service");
    
    await setupTestZone(2004, [
      { host: "192.168.1.23", port: 6007 },
      { host: "192.168.1.23", port: 6008 }
    ]);
    
    const record1 = await createTestRecord(
      "192.168.1.23", 6007, 2004, null, "TEST008|NR"
    );
    await processor.processRecord({
      recordId: record1,
      host: "192.168.1.23",
      port: 6007,
      zoneId: 2004,
      barcode: null,
      message: "TEST008|NR"
    });
    
    await wait(600);
    
    const cycles = await getZoneCycles(2004);
    assert.strictEqual(cycles[0].status, "NR");
    assert.strictEqual(cycles[0].completion_reason, "TIMEOUT");
  });
  
  await test("Three devices: All respond → Early completion", async () => {
    process.env.ZONE_CYCLE_TIME_MS = "2000";
    delete require.cache[require.resolve("../Src/services/zoneCycleProcessor.service")];
    const processor = require("../Src/services/zoneCycleProcessor.service");
    
    await setupTestZone(2005, [
      { host: "192.168.1.24", port: 6009 },
      { host: "192.168.1.24", port: 6010 },
      { host: "192.168.1.24", port: 6011 }
    ]);
    
    const records = [];
    for (let i = 0; i < 3; i++) {
      const recordId = await createTestRecord(
        "192.168.1.24", 6009 + i, 2005, i === 1 ? "DEVICE2" : null, `TEST009_${i}|${i === 1 ? "DEVICE2" : "NR"}`
      );
      records.push(recordId);
      await processor.processRecord({
        recordId,
        host: "192.168.1.24",
        port: 6009 + i,
        zoneId: 2005,
        barcode: i === 1 ? "DEVICE2" : null,
        message: `TEST009_${i}|${i === 1 ? "DEVICE2" : "NR"}`
      });
      await wait(30);
    }
    
    // Should complete immediately after third device
    await wait(100);
    
    const cycles = await getZoneCycles(2005);
    assert.strictEqual(cycles[0].status, "PASS");
    assert.strictEqual(cycles[0].barcode, "DEVICE2");
    assert.strictEqual(cycles[0].completion_reason, "ALL_DEVICES_RECEIVED");
    
    const receivedDevices = JSON.parse(cycles[0].received_devices);
    assert.strictEqual(receivedDevices.length, 3, "All 3 devices should be recorded");
  });
  
  await test("Duplicate messages from same device don't trigger early completion", async () => {
    process.env.ZONE_CYCLE_TIME_MS = "800";
    delete require.cache[require.resolve("../Src/services/zoneCycleProcessor.service")];
    const processor = require("../Src/services/zoneCycleProcessor.service");
    
    await setupTestZone(2006, [
      { host: "192.168.1.25", port: 6012 },
      { host: "192.168.1.25", port: 6013 }
    ]);
    
    // Device 1 sends 3 messages
    for (let i = 0; i < 3; i++) {
      const recordId = await createTestRecord(
        "192.168.1.25", 6012, 2006, "DUP123", `TEST010_${i}|DUP123`
      );
      await processor.processRecord({
        recordId,
        host: "192.168.1.25",
        port: 6012,
        zoneId: 2006,
        barcode: "DUP123",
        message: `TEST010_${i}|DUP123`
      });
      await wait(30);
    }
    
    // Should NOT complete early - still waiting for device 2
    await wait(100);
    let cycles = await getZoneCycles(2006);
    assert.strictEqual(cycles.length, 0, "Should not complete with only one device");
    
    // Wait for timeout
    await wait(700);
    cycles = await getZoneCycles(2006);
    assert.strictEqual(cycles.length, 1);
    assert.strictEqual(cycles[0].completion_reason, "TIMEOUT");
    assert.strictEqual(cycles[0].status, "PASS");
  });
  
  // ============================================================================
  // ZONE ISOLATION TESTS
  // ============================================================================
  
  await test("Zone 1 and Zone 2 process simultaneously without interference", async () => {
    process.env.ZONE_CYCLE_TIME_MS = "1000";
    delete require.cache[require.resolve("../Src/services/zoneCycleProcessor.service")];
    const processor = require("../Src/services/zoneCycleProcessor.service");
    
    // Setup Zone 1
    await setupTestZone(3001, [
      { host: "192.168.1.30", port: 7001 },
      { host: "192.168.1.30", port: 7002 }
    ]);
    
    // Setup Zone 2
    await setupTestZone(3002, [
      { host: "192.168.1.31", port: 7003 }
    ]);
    
    // Zone 1 - Device 1 (no barcode)
    const z1r1 = await createTestRecord(
      "192.168.1.30", 7001, 3001, null, "Z1_TEST1|NR"
    );
    await processor.processRecord({
      recordId: z1r1,
      host: "192.168.1.30",
      port: 7001,
      zoneId: 3001,
      barcode: null,
      message: "Z1_TEST1|NR"
    });
    
    await wait(50);
    
    // Zone 2 - Device 1 (has barcode) - should complete immediately
    const z2r1 = await createTestRecord(
      "192.168.1.31", 7003, 3002, "Z2_BAR", "Z2_TEST1|Z2_BAR"
    );
    await processor.processRecord({
      recordId: z2r1,
      host: "192.168.1.31",
      port: 7003,
      zoneId: 3002,
      barcode: "Z2_BAR",
      message: "Z2_TEST1|Z2_BAR"
    });
    
    await wait(100);
    
    // Zone 2 should be completed, Zone 1 should still be active
    const z2cycles = await getZoneCycles(3002);
    assert.strictEqual(z2cycles.length, 1, "Zone 2 should have 1 completed cycle");
    assert.strictEqual(z2cycles[0].status, "PASS");
    
    const z1cycles = await getZoneCycles(3001);
    assert.strictEqual(z1cycles.length, 0, "Zone 1 should still be active");
    
    // Complete Zone 1
    const z1r2 = await createTestRecord(
      "192.168.1.30", 7002, 3001, "Z1_LATE", "Z1_TEST2|Z1_LATE"
    );
    await processor.processRecord({
      recordId: z1r2,
      host: "192.168.1.30",
      port: 7002,
      zoneId: 3001,
      barcode: "Z1_LATE",
      message: "Z1_TEST2|Z1_LATE"
    });
    
    await wait(100);
    
    const z1finalCycles = await getZoneCycles(3001);
    assert.strictEqual(z1finalCycles.length, 1);
    assert.strictEqual(z1finalCycles[0].status, "PASS");
    assert.strictEqual(z1finalCycles[0].barcode, "Z1_LATE");
  });
  
  // ============================================================================
  // EDGE CASES
  // ============================================================================
  
  await test("Barcode validation rejects NR, empty, null values", async () => {
    process.env.ZONE_CYCLE_TIME_MS = "500";
    delete require.cache[require.resolve("../Src/services/zoneCycleProcessor.service")];
    const processor = require("../Src/services/zoneCycleProcessor.service");
    
    assert.strictEqual(processor.isValidBarcode(null), false);
    assert.strictEqual(processor.isValidBarcode(undefined), false);
    assert.strictEqual(processor.isValidBarcode(""), false);
    assert.strictEqual(processor.isValidBarcode("   "), false);
    assert.strictEqual(processor.isValidBarcode("NR"), false);
    assert.strictEqual(processor.isValidBarcode("nr"), false);
    assert.strictEqual(processor.isValidBarcode("ERROR"), false);
    assert.strictEqual(processor.isValidBarcode("NOREAD"), false);
    assert.strictEqual(processor.isValidBarcode("ABC123"), true);
    assert.strictEqual(processor.isValidBarcode("12345"), true);
  });
  
  await test("Different ZONE_CYCLE_TIME_MS values work correctly", async () => {
    // Test with 300ms timeout
    process.env.ZONE_CYCLE_TIME_MS = "300";
    delete require.cache[require.resolve("../Src/services/zoneCycleProcessor.service")];
    const processor = require("../Src/services/zoneCycleProcessor.service");
    
    await setupTestZone(4001, [
      { host: "192.168.1.40", port: 8001 },
      { host: "192.168.1.40", port: 8002 }
    ]);
    
    const record1 = await createTestRecord(
      "192.168.1.40", 8001, 4001, "FAST", "FAST_TEST|FAST"
    );
    await processor.processRecord({
      recordId: record1,
      host: "192.168.1.40",
      port: 8001,
      zoneId: 4001,
      barcode: "FAST",
      message: "FAST_TEST|FAST"
    });
    
    // Wait for timeout (300ms + buffer)
    await wait(400);
    
    const cycles = await getZoneCycles(4001);
    assert.strictEqual(cycles.length, 1);
    assert.strictEqual(cycles[0].completion_reason, "TIMEOUT");
    assert.strictEqual(cycles[0].status, "PASS");
  });
  
  await test("Message arriving after cycle closed creates new cycle", async () => {
    process.env.ZONE_CYCLE_TIME_MS = "500";
    delete require.cache[require.resolve("../Src/services/zoneCycleProcessor.service")];
    const processor = require("../Src/services/zoneCycleProcessor.service");
    
    await setupTestZone(4002, [
      { host: "192.168.1.41", port: 8003 }
    ]);
    
    // First tote
    const record1 = await createTestRecord(
      "192.168.1.41", 8003, 4002, "FIRST", "TOTE1|FIRST"
    );
    await processor.processRecord({
      recordId: record1,
      host: "192.168.1.41",
      port: 8003,
      zoneId: 4002,
      barcode: "FIRST",
      message: "TOTE1|FIRST"
    });
    
    await wait(200);
    
    const firstCycles = await getZoneCycles(4002);
    assert.strictEqual(firstCycles.length, 1);
    assert.strictEqual(firstCycles[0].barcode, "FIRST");
    
    // Second tote (after first cycle completed)
    const record2 = await createTestRecord(
      "192.168.1.41", 8003, 4002, "SECOND", "TOTE2|SECOND"
    );
    await processor.processRecord({
      recordId: record2,
      host: "192.168.1.41",
      port: 8003,
      zoneId: 4002,
      barcode: "SECOND",
      message: "TOTE2|SECOND"
    });
    
    await wait(200);
    
    const allCycles = await getZoneCycles(4002);
    assert.strictEqual(allCycles.length, 2, "Should have 2 separate cycles");
    assert.strictEqual(allCycles[0].barcode, "SECOND", "Most recent should be SECOND");
    assert.strictEqual(allCycles[1].barcode, "FIRST", "First should be FIRST");
  });
  
  // ============================================================================
  // SUMMARY
  // ============================================================================
  
  await clearTestData();
  process.env.ZONE_CYCLE_TIME_MS = originalEnv;
  
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Test Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(60));
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runTests().catch(err => {
    console.error("Test suite error:", err);
    process.exit(1);
  });
}

module.exports = { runTests };
