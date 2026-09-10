/**
 * Zone Cycle Processor Service
 * 
 * Handles zone-wise tote cycle processing with independent state management per zone.
 * Each zone maintains its own active cycle, timer, device tracking, and completion logic.
 * 
 * Key Business Rules:
 * - Each zone has completely independent cycle processing
 * - Cycle completes when ALL expected devices respond OR timeout expires (whichever first)
 * - PASS if ANY device in the cycle has a valid barcode
 * - NR if cycle completes with NO valid barcode
 * - First received record used as representative for NR results
 * - Duplicate messages from same device don't count as additional responses
 */

const db = require("../config/db");
const logger = require("./logger");
const crypto = require("crypto");

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

const ZONE_CYCLE_TIME_MS = Number(process.env.ZONE_CYCLE_TIME_MS) || 2000;

// Validate configuration on module load
if (isNaN(ZONE_CYCLE_TIME_MS) || ZONE_CYCLE_TIME_MS <= 0) {
  logger.error(`[ZoneCycleProcessor] Invalid ZONE_CYCLE_TIME_MS: ${process.env.ZONE_CYCLE_TIME_MS}. Using default 2000ms.`);
}

logger.info(`[ZoneCycleProcessor] Initialized with ZONE_CYCLE_TIME_MS=${ZONE_CYCLE_TIME_MS}ms`);

// ══════════════════════════════════════════════════════════════════════════════
// STATE MANAGEMENT - Independent per zone using Map
// ══════════════════════════════════════════════════════════════════════════════

// Key: zoneId (integer) -> Value: ActiveCycle object
const activeCycles = new Map();

/**
 * ActiveCycle structure:
 * {
 *   cycleId: string (UUID),
 *   zoneId: number,
 *   startedAt: string (ISO timestamp),
 *   expiresAt: number (Date.now() + timeout),
 *   firstRecordId: number,
 *   expectedDeviceIds: Set<string> (host:port),
 *   receivedDeviceIds: Set<string> (host:port),
 *   collectedRecords: Array<{recordId, deviceId, barcode, message, receivedAt}>,
 *   detectedBarcode: string | null,
 *   timerRef: NodeJS.Timeout,
 *   completed: boolean (finalization guard)
 * }
 */

// ══════════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

function generateCycleId() {
  return crypto.randomUUID();
}

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

function deviceKey(host, port) {
  return `${host}:${port}`;
}

/**
 * Extract image name from TCP message
 * Format: "123|9864" → image: "123", barcode: "9864"
 * Format: "123|NR" → image: "123", barcode: null
 * Format: "123" → image: "123", barcode: null
 */
function extractImageName(message) {
  if (!message) return null;
  const parts = message.split("|");
  return parts[0]?.trim() || null;
}

/**
 * Validates if a barcode value is legitimate
 * Rejects: null, undefined, empty string, whitespace, "NR", "ERROR", "NOREAD"
 */
function isValidBarcode(barcode) {
  if (!barcode || typeof barcode !== "string") return false;
  const trimmed = barcode.trim();
  if (trimmed.length === 0) return false;
  
  // Reject known no-read indicators (case-insensitive)
  const upper = trimmed.toUpperCase();
  if (upper === "NR" || upper === "ERROR" || upper === "NOREAD" || upper === "NO-READ") {
    return false;
  }
  
  return true;
}

/**
 * Look up the human-readable name for a zone from tcp_zones table.
 * Returns the name string, or null if not found.
 */
async function getZoneName(zoneId) {
  try {
    const [rows] = await db.execute(
      "SELECT name FROM tcp_zones WHERE id = ? LIMIT 1",
      [zoneId]
    );
    return rows?.[0]?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Query all devices (host:port pairs) assigned to a specific zone
 * Returns array of device keys like ["192.168.1.10:5001", "192.168.1.10:5002"]
 */
async function getExpectedDevicesForZone(zoneId) {
  try {
    const [rows] = await db.execute(
      `SELECT DISTINCT host, port 
       FROM user_tcp_configs 
       WHERE zone_id = ? AND is_active = 1`,
      [zoneId]
    );
    
    if (!rows || rows.length === 0) {
      logger.warn(`[ZoneCycleProcessor] Zone ${zoneId} has NO active devices configured`);
      return [];
    }
    
    const devices = rows.map(r => deviceKey(r.host, r.port));
    logger.info(`[ZoneCycleProcessor] Zone ${zoneId} expects ${devices.length} device(s): ${devices.join(", ")}`);
    return devices;
  } catch (err) {
    logger.error(`[ZoneCycleProcessor] Failed to query devices for zone ${zoneId}: ${err.message}`);
    return [];
  }
}

/**
 * Check if all expected devices have now responded
 */
function allDevicesReceived(cycle) {
  if (cycle.expectedDeviceIds.size === 0) return false;
  
  for (const deviceId of cycle.expectedDeviceIds) {
    if (!cycle.receivedDeviceIds.has(deviceId)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Determine PASS/NR status by checking all collected records for valid barcodes
 * Returns: { status: "PASS" | "NR", barcodes: string (pipe-separated), imageName: string }
 */
function determineCycleStatus(cycle) {
  const allBarcodes = [];
  
  // Collect ALL valid barcodes from all records (including duplicates)
  for (const record of cycle.collectedRecords) {
    if (isValidBarcode(record.barcode)) {
      allBarcodes.push(record.barcode);
    }
  }
  
  // Get image name from first record
  const firstImageName = cycle.collectedRecords[0]?.imageName || null;
  
  if (allBarcodes.length > 0) {
    // PASS - concatenate all barcodes with pipe separator
    const barcodesString = allBarcodes.join("|");
    logger.info(`[ZoneCycleProcessor] Zone ${cycle.zoneId} Cycle ${cycle.cycleId}: PASS with ${allBarcodes.length} barcode(s): "${barcodesString}"`);
    return { status: "PASS", barcodes: barcodesString, imageName: firstImageName };
  }
  
  // No valid barcode found in any record - NR
  logger.info(`[ZoneCycleProcessor] Zone ${cycle.zoneId} Cycle ${cycle.cycleId}: NR (no valid barcode in ${cycle.collectedRecords.length} record(s)), image: ${firstImageName}`);
  return { status: "NR", barcodes: null, imageName: firstImageName };
}

/**
 * Persist the cycle result to the database
 */
async function saveCycleResult(cycle, completionReason) {
  const { status, barcodes, imageName } = determineCycleStatus(cycle);
  const completedAt = getKolkataTimeStr();
  
  // Calculate cycle duration in milliseconds
  const startTime = new Date(cycle.startedAt).getTime();
  const endTime = new Date(completedAt).getTime();
  const durationMs = endTime - startTime;

  // Resolve zone name at write time so it survives zone renames/deletes
  const zoneName = await getZoneName(cycle.zoneId);
  
  try {
    await db.execute(
      `INSERT INTO zone_cycles 
        (cycle_id, zone_id, zone_name, started_at, completed_at, status, barcode, image_name, first_record_id, 
         completion_reason, expected_devices, received_devices)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cycle.cycleId,
        cycle.zoneId,
        zoneName,
        cycle.startedAt,
        completedAt,
        status,
        barcodes,
        imageName,
        cycle.firstRecordId,
        completionReason,
        JSON.stringify([...cycle.expectedDeviceIds]),
        JSON.stringify([...cycle.receivedDeviceIds])
      ]
    );
    
    logger.info(`[ZoneCycleProcessor] Zone ${cycle.zoneId} Cycle ${cycle.cycleId}: Saved result ${status} (reason: ${completionReason}, duration: ${durationMs}ms)`);
    
    // Log summary
    const missingDevices = [...cycle.expectedDeviceIds].filter(d => !cycle.receivedDeviceIds.has(d));
    if (missingDevices.length > 0) {
      logger.info(`[ZoneCycleProcessor] Zone ${cycle.zoneId} Cycle ${cycle.cycleId}: Missing devices: ${missingDevices.join(", ")}`);
    }
    
    return { status, barcodes, imageName, completedAt, durationMs };
  } catch (err) {
    logger.error(`[ZoneCycleProcessor] Failed to save cycle result for zone ${cycle.zoneId}: ${err.message}`);
    throw err;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CYCLE FINALIZATION (Idempotent)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Finalize a cycle - can be called from early completion OR timeout
 * Protected against duplicate execution via 'completed' flag
 */
async function finalizeCycle(cycle, completionReason) {
  // Idempotency guard: prevent duplicate finalization
  if (cycle.completed) {
    logger.warn(`[ZoneCycleProcessor] Zone ${cycle.zoneId} Cycle ${cycle.cycleId}: Already completed, ignoring duplicate finalization`);
    return;
  }
  
  cycle.completed = true;
  
  // Cancel timer if it exists
  if (cycle.timerRef) {
    clearTimeout(cycle.timerRef);
    cycle.timerRef = null;
  }
  
  logger.info(`[ZoneCycleProcessor] Zone ${cycle.zoneId} Cycle ${cycle.cycleId}: Finalizing (${completionReason})`);
  logger.info(`[ZoneCycleProcessor] Zone ${cycle.zoneId} Cycle ${cycle.cycleId}: Collected ${cycle.collectedRecords.length} record(s) from ${cycle.receivedDeviceIds.size}/${cycle.expectedDeviceIds.size} device(s)`);
  
  try {
    // Determine PASS/NR and save to database
    const result = await saveCycleResult(cycle, completionReason);
    
    // Remove from active cycles
    activeCycles.delete(cycle.zoneId);
    
    logger.info(`[ZoneCycleProcessor] Zone ${cycle.zoneId} Cycle ${cycle.cycleId}: Finalized with status ${result.status}`);
  } catch (err) {
    logger.error(`[ZoneCycleProcessor] Zone ${cycle.zoneId} Cycle ${cycle.cycleId}: Finalization error: ${err.message}`);
    // Still remove from active cycles even on error to prevent stuck state
    activeCycles.delete(cycle.zoneId);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TIMEOUT HANDLER
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Called when ZONE_CYCLE_TIME_MS expires for a zone
 * Verifies cycle is still active before finalizing (stale timer protection)
 */
async function handleCycleTimeout(zoneId, cycleId) {
  const cycle = activeCycles.get(zoneId);
  
  // Stale timer protection: verify this timer is for the current active cycle
  if (!cycle) {
    logger.warn(`[ZoneCycleProcessor] Zone ${zoneId} Cycle ${cycleId}: Timeout fired but no active cycle (stale timer)`);
    return;
  }
  
  if (cycle.cycleId !== cycleId) {
    logger.warn(`[ZoneCycleProcessor] Zone ${zoneId} Cycle ${cycleId}: Timeout fired but different cycle is active (stale timer)`);
    return;
  }
  
  if (cycle.completed) {
    logger.warn(`[ZoneCycleProcessor] Zone ${zoneId} Cycle ${cycleId}: Timeout fired but cycle already completed (stale timer)`);
    return;
  }
  
  logger.info(`[ZoneCycleProcessor] Zone ${zoneId} Cycle ${cycleId}: TIMEOUT expired (${ZONE_CYCLE_TIME_MS}ms)`);
  
  await finalizeCycle(cycle, "TIMEOUT");
}

// ══════════════════════════════════════════════════════════════════════════════
// CYCLE CREATION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Create a new cycle for a zone when first device message arrives
 */
async function createCycle(zoneId, recordId, deviceId, barcode, message) {
  const cycleId = generateCycleId();
  const startedAt = getKolkataTimeStr();
  const expiresAt = Date.now() + ZONE_CYCLE_TIME_MS;
  
  // Get expected devices for this zone
  const expectedDevices = await getExpectedDevicesForZone(zoneId);
  
  if (expectedDevices.length === 0) {
    logger.error(`[ZoneCycleProcessor] Zone ${zoneId}: Cannot create cycle - no devices configured for this zone`);
    // Still save a cycle result for tracking purposes
    try {
      const completedAt = getKolkataTimeStr();
      const status = isValidBarcode(barcode) ? "PASS" : "NR";
      const imageName = extractImageName(message);
      const zoneName = await getZoneName(zoneId);
      await db.execute(
        `INSERT INTO zone_cycles 
          (cycle_id, zone_id, zone_name, started_at, completed_at, status, barcode, image_name, first_record_id, 
           completion_reason, expected_devices, received_devices)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cycleId,
          zoneId,
          zoneName,
          startedAt,
          completedAt,
          status,
          isValidBarcode(barcode) ? barcode : null,
          imageName,
          recordId,
          "TIMEOUT",
          JSON.stringify([]),
          JSON.stringify([deviceId])
        ]
      );
      logger.info(`[ZoneCycleProcessor] Zone ${zoneId}: Saved single-device cycle ${cycleId} with status ${status}`);
    } catch (err) {
      logger.error(`[ZoneCycleProcessor] Failed to save single-device cycle: ${err.message}`);
    }
    return;
  }
  
  const cycle = {
    cycleId,
    zoneId,
    startedAt,
    expiresAt,
    firstRecordId: recordId,
    expectedDeviceIds: new Set(expectedDevices),
    receivedDeviceIds: new Set([deviceId]),
    collectedRecords: [{
      recordId,
      deviceId,
      barcode,
      message,
      imageName: extractImageName(message),
      receivedAt: startedAt
    }],
    detectedBarcode: isValidBarcode(barcode) ? barcode : null,
    timerRef: null,
    completed: false
  };
  
  // Set timeout for this zone
  cycle.timerRef = setTimeout(() => {
    handleCycleTimeout(zoneId, cycleId);
  }, ZONE_CYCLE_TIME_MS);
  
  activeCycles.set(zoneId, cycle);
  
  logger.info(`[ZoneCycleProcessor] Zone ${zoneId} Cycle ${cycleId}: Created new cycle (expecting ${expectedDevices.length} device(s), timeout in ${ZONE_CYCLE_TIME_MS}ms)`);
  logger.info(`[ZoneCycleProcessor] Zone ${zoneId} Cycle ${cycleId}: First device ${deviceId} | barcode: ${barcode || "none"}`);
  
  // Check if this single device is the only expected device (early completion possible)
  if (allDevicesReceived(cycle)) {
    logger.info(`[ZoneCycleProcessor] Zone ${zoneId} Cycle ${cycleId}: All devices received immediately (single-device zone)`);
    await finalizeCycle(cycle, "ALL_DEVICES_RECEIVED");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ADD RECORD TO EXISTING CYCLE
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Add a record to an existing active cycle for the zone
 */
async function addRecordToCycle(cycle, recordId, deviceId, barcode, message) {
  if (cycle.completed) {
    logger.warn(`[ZoneCycleProcessor] Zone ${cycle.zoneId} Cycle ${cycle.cycleId}: Cannot add record - cycle already completed`);
    return;
  }
  
  // Track this device as received (Set prevents duplicates)
  const wasNew = !cycle.receivedDeviceIds.has(deviceId);
  cycle.receivedDeviceIds.add(deviceId);
  
  // Add record to collected records
  cycle.collectedRecords.push({
    recordId,
    deviceId,
    barcode,
    message,
    imageName: extractImageName(message),
    receivedAt: getKolkataTimeStr()
  });
  
  // Update detected barcode if this record has a valid one
  if (isValidBarcode(barcode) && !cycle.detectedBarcode) {
    cycle.detectedBarcode = barcode;
    logger.info(`[ZoneCycleProcessor] Zone ${cycle.zoneId} Cycle ${cycle.cycleId}: Barcode detected: "${barcode}" from device ${deviceId}`);
  }
  
  if (wasNew) {
    logger.info(`[ZoneCycleProcessor] Zone ${cycle.zoneId} Cycle ${cycle.cycleId}: Device ${deviceId} responded (${cycle.receivedDeviceIds.size}/${cycle.expectedDeviceIds.size})`);
  } else {
    logger.info(`[ZoneCycleProcessor] Zone ${cycle.zoneId} Cycle ${cycle.cycleId}: Duplicate message from device ${deviceId} (ignored for completion check)`);
  }
  
  // Check for early completion: all expected devices have responded
  if (allDevicesReceived(cycle)) {
    logger.info(`[ZoneCycleProcessor] Zone ${cycle.zoneId} Cycle ${cycle.cycleId}: ALL expected devices received - completing early`);
    await finalizeCycle(cycle, "ALL_DEVICES_RECEIVED");
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Process a captured TCP record for zone cycle tracking
 * Called after the record has been saved to tcp_messages table
 * 
 * @param {object} record - The captured record
 * @param {number} record.recordId - Database ID of tcp_messages record
 * @param {string} record.host - Device host/IP
 * @param {number} record.port - Device port
 * @param {number|null} record.zoneId - Zone ID (null if no zone assigned)
 * @param {string|null} record.barcode - Extracted barcode value
 * @param {string} record.message - Raw TCP message
 */
async function processRecord(record) {
  const { recordId, host, port, zoneId, barcode, message } = record;
  
  // Ignore records without zone assignment
  if (!zoneId) {
    logger.debug(`[ZoneCycleProcessor] Record ${recordId} has no zone assignment - skipping cycle processing`);
    return;
  }
  
  const deviceId = deviceKey(host, port);
  
  // Check if this zone has an active cycle
  const existingCycle = activeCycles.get(zoneId);
  
  if (!existingCycle) {
    // No active cycle - create new one
    logger.info(`[ZoneCycleProcessor] Zone ${zoneId}: No active cycle - creating new cycle for device ${deviceId}`);
    await createCycle(zoneId, recordId, deviceId, barcode, message);
  } else {
    // Active cycle exists - add this record to it
    logger.info(`[ZoneCycleProcessor] Zone ${zoneId} Cycle ${existingCycle.cycleId}: Adding record from device ${deviceId}`);
    await addRecordToCycle(existingCycle, recordId, deviceId, barcode, message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ══════════════════════════════════════════════════════════════════════════════

module.exports = {
  processRecord,
  isValidBarcode,
  getActiveCycles: () => activeCycles,
  getActiveCycleForZone: (zoneId) => activeCycles.get(zoneId),
  // Exported for testing
  _test: {
    createCycle,
    finalizeCycle,
    allDevicesReceived,
    determineCycleStatus,
    ZONE_CYCLE_TIME_MS
  }
};
