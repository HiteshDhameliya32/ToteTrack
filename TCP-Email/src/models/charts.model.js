const db = require("../config/db");

// All queries read from zone_cycles (PASS/NR) joined with tcp_zones for names.
// zone_cycles has no company_id — all data is shared (single-tenant device data).

/* ─── Stats cards ─────────────────────────────────────── */
async function getEnhancedStats() {
  // Total / PASS / NR / today cycles
  const [[base]] = await db.execute(`
    SELECT
      COUNT(*)                                                                  AS total,
      SUM(CASE WHEN status = 'PASS' THEN 1 ELSE 0 END)                        AS pass,
      SUM(CASE WHEN status = 'NR'   THEN 1 ELSE 0 END)                        AS nr,
      SUM(CASE WHEN date(started_at) = date('now','+5 hours','+30 minutes')
               THEN 1 ELSE 0 END)                                              AS today,
      SUM(CASE WHEN status = 'PASS'
               AND date(started_at) = date('now','+5 hours','+30 minutes')
               THEN 1 ELSE 0 END)                                              AS pass_today,
      SUM(CASE WHEN status = 'NR'
               AND date(started_at) = date('now','+5 hours','+30 minutes')
               THEN 1 ELSE 0 END)                                              AS nr_today
    FROM zone_cycles
    WHERE status IS NOT NULL
  `);

  // Active email schedules
  const [[scheds]] = await db.execute(
    `SELECT COUNT(*) AS count FROM email_schedules WHERE active = 1`
  );

  const total     = Number(base.total      ?? 0);
  const pass      = Number(base.pass       ?? 0);
  const nr        = Number(base.nr         ?? 0);
  const passRate  = total > 0 ? Math.round((pass / total) * 100) : 0;

  return {
    total,
    pass,
    nr,
    today:           Number(base.today      ?? 0),
    passToday:       Number(base.pass_today ?? 0),
    nrToday:         Number(base.nr_today   ?? 0),
    passRate,
    activeSchedules: Number(scheds.count    ?? 0),
  };
}

/* ─── Hourly trend — last 24 h (PASS + NR lines) ─────── */
async function getMessagesTrend() {
  const [rows] = await db.execute(`
    SELECT
      strftime('%H:00', started_at)                   AS hour,
      CAST(strftime('%H', started_at) AS INTEGER)     AS hour_num,
      SUM(CASE WHEN status = 'PASS' THEN 1 ELSE 0 END) AS pass,
      SUM(CASE WHEN status = 'NR'   THEN 1 ELSE 0 END) AS nr,
      COUNT(*)                                         AS total
    FROM zone_cycles
    WHERE status IS NOT NULL
      AND started_at >= datetime('now', '+5 hours', '+30 minutes', '-24 hours')
    GROUP BY strftime('%H', started_at)
    ORDER BY hour_num ASC
  `);

  return rows.map(r => ({
    hour:  r.hour,
    pass:  Number(r.pass),
    nr:    Number(r.nr),
    total: Number(r.total),
  }));
}

/* ─── PASS / NR pie ───────────────────────────────────── */
async function getEmailStatusDistribution() {
  const [[r]] = await db.execute(`
    SELECT
      SUM(CASE WHEN status = 'PASS' THEN 1 ELSE 0 END) AS pass,
      SUM(CASE WHEN status = 'NR'   THEN 1 ELSE 0 END) AS nr
    FROM zone_cycles
    WHERE status IS NOT NULL
  `);

  return [
    { name: "PASS", value: Number(r.pass ?? 0) },
    { name: "NR",   value: Number(r.nr   ?? 0) },
  ];
}

/* ─── Daily cycles — last 30 days (PASS + NR stacked) ── */
async function getDailyRecords() {
  const [rows] = await db.execute(`
    SELECT
      date(started_at)  AS date,
      strftime('%d', started_at) || ' ' ||
        CASE strftime('%m', started_at)
          WHEN '01' THEN 'Jan' WHEN '02' THEN 'Feb' WHEN '03' THEN 'Mar'
          WHEN '04' THEN 'Apr' WHEN '05' THEN 'May' WHEN '06' THEN 'Jun'
          WHEN '07' THEN 'Jul' WHEN '08' THEN 'Aug' WHEN '09' THEN 'Sep'
          WHEN '10' THEN 'Oct' WHEN '11' THEN 'Nov' WHEN '12' THEN 'Dec'
        END              AS label,
      SUM(CASE WHEN status = 'PASS' THEN 1 ELSE 0 END) AS pass,
      SUM(CASE WHEN status = 'NR'   THEN 1 ELSE 0 END) AS nr,
      COUNT(*)           AS total
    FROM zone_cycles
    WHERE status IS NOT NULL
      AND started_at >= date('now', '+5 hours', '+30 minutes', '-30 days')
    GROUP BY date(started_at)
    ORDER BY date(started_at) ASC
  `);

  return rows.map(r => ({
    date:  r.label,
    pass:  Number(r.pass),
    nr:    Number(r.nr),
    total: Number(r.total),
  }));
}

/* ─── Email send history — last 30 days (unchanged) ──── */
async function getEmailHistory(companyId, isSuperAdmin = false) {
  const where  = ["status = 'success'", "sent_at >= date('now','+5 hours','+30 minutes','-30 days')"];
  const params = [];

  const filter = isSuperAdmin && !companyId ? false : true;
  if (filter) { where.push("company_id = ?"); params.push(companyId || 1); }

  const [rows] = await db.execute(`
    SELECT
      date(sent_at) AS date,
      strftime('%d', sent_at) || ' ' ||
        CASE strftime('%m', sent_at)
          WHEN '01' THEN 'Jan' WHEN '02' THEN 'Feb' WHEN '03' THEN 'Mar'
          WHEN '04' THEN 'Apr' WHEN '05' THEN 'May' WHEN '06' THEN 'Jun'
          WHEN '07' THEN 'Jul' WHEN '08' THEN 'Aug' WHEN '09' THEN 'Sep'
          WHEN '10' THEN 'Oct' WHEN '11' THEN 'Nov' WHEN '12' THEN 'Dec'
        END AS label,
      COUNT(*)          AS emails,
      SUM(record_count) AS records_sent
    FROM email_logs
    WHERE ${where.join(" AND ")}
    GROUP BY date(sent_at)
    ORDER BY date(sent_at) ASC
  `, params);

  return rows.map(r => ({
    date:    r.label,
    emails:  Number(r.emails),
    records: Number(r.records_sent ?? 0),
  }));
}

/* ─── Peak traffic hours — from zone_cycles ──────────── */
async function getBusyHours() {
  const [rows] = await db.execute(`
    SELECT
      strftime('%H:00', started_at)                   AS hour,
      CAST(strftime('%H', started_at) AS INTEGER)     AS hour_num,
      COUNT(*)                                         AS total,
      SUM(CASE WHEN status = 'PASS' THEN 1 ELSE 0 END) AS pass,
      SUM(CASE WHEN status = 'NR'   THEN 1 ELSE 0 END) AS nr
    FROM zone_cycles
    WHERE status IS NOT NULL
    GROUP BY strftime('%H', started_at)
    ORDER BY total DESC
    LIMIT 12
  `);

  return rows.map(r => ({
    hour:  r.hour,
    total: Number(r.total),
    pass:  Number(r.pass),
    nr:    Number(r.nr),
  }));
}

/* ─── Zone breakdown — PASS/NR per zone ──────────────── */
async function getZoneBreakdown() {
  const [rows] = await db.execute(`
    SELECT
      zc.zone_id,
      COALESCE(zc.zone_name, tz.name, 'Zone ' || zc.zone_id) AS zone_name,
      COUNT(*)                                   AS total,
      SUM(CASE WHEN zc.status = 'PASS' THEN 1 ELSE 0 END) AS pass,
      SUM(CASE WHEN zc.status = 'NR'   THEN 1 ELSE 0 END) AS nr
    FROM zone_cycles zc
    LEFT JOIN tcp_zones tz ON tz.id = zc.zone_id
    WHERE zc.status IS NOT NULL
    GROUP BY zc.zone_id
    ORDER BY total DESC
  `);

  return rows.map(r => ({
    zone_id:   r.zone_id,
    zone_name: r.zone_name,
    total:     Number(r.total),
    pass:      Number(r.pass),
    nr:        Number(r.nr),
  }));
}

/* ─── Zone pass rate — % per zone (all time) ─────────── */
async function getZonePassRate() {
  const [rows] = await db.execute(`
    SELECT
      zc.zone_id,
      COALESCE(zc.zone_name, tz.name, 'Zone ' || zc.zone_id) AS zone_name,
      COUNT(*)                                                  AS total,
      SUM(CASE WHEN zc.status = 'PASS' THEN 1 ELSE 0 END)     AS pass,
      SUM(CASE WHEN zc.status = 'NR'   THEN 1 ELSE 0 END)     AS nr,
      ROUND(
        100.0 * SUM(CASE WHEN zc.status = 'PASS' THEN 1 ELSE 0 END) / COUNT(*),
        1
      ) AS pass_rate
    FROM zone_cycles zc
    LEFT JOIN tcp_zones tz ON tz.id = zc.zone_id
    WHERE zc.status IS NOT NULL
    GROUP BY zc.zone_id
    ORDER BY pass_rate DESC
  `);

  return rows.map(r => ({
    zone_id:   r.zone_id,
    zone_name: r.zone_name,
    total:     Number(r.total),
    pass:      Number(r.pass),
    nr:        Number(r.nr),
    pass_rate: Number(r.pass_rate ?? 0),
  }));
}

/* ─── Zone daily trend — PASS/NR per zone last 7 days ── */
async function getZoneDailyTrend() {
  const [rows] = await db.execute(`
    SELECT
      zc.zone_id,
      COALESCE(zc.zone_name, tz.name, 'Zone ' || zc.zone_id) AS zone_name,
      date(zc.started_at) AS day,
      strftime('%d', zc.started_at) || ' ' ||
        CASE strftime('%m', zc.started_at)
          WHEN '01' THEN 'Jan' WHEN '02' THEN 'Feb' WHEN '03' THEN 'Mar'
          WHEN '04' THEN 'Apr' WHEN '05' THEN 'May' WHEN '06' THEN 'Jun'
          WHEN '07' THEN 'Jul' WHEN '08' THEN 'Aug' WHEN '09' THEN 'Sep'
          WHEN '10' THEN 'Oct' WHEN '11' THEN 'Nov' WHEN '12' THEN 'Dec'
        END AS label,
      SUM(CASE WHEN zc.status = 'PASS' THEN 1 ELSE 0 END) AS pass,
      SUM(CASE WHEN zc.status = 'NR'   THEN 1 ELSE 0 END) AS nr,
      COUNT(*) AS total
    FROM zone_cycles zc
    LEFT JOIN tcp_zones tz ON tz.id = zc.zone_id
    WHERE zc.status IS NOT NULL
      AND zc.started_at >= date('now', '+5 hours', '+30 minutes', '-7 days')
    GROUP BY zc.zone_id, date(zc.started_at)
    ORDER BY day ASC, zc.zone_id ASC
  `);

  // Pivot: { day, label, Zone1_pass, Zone1_nr, Zone2_pass, ... }
  const dayMap = new Map();
  const zoneNames = new Set();

  for (const r of rows) {
    const name = r.zone_name;
    zoneNames.add(name);
    if (!dayMap.has(r.day)) dayMap.set(r.day, { day: r.day, label: r.label });
    const entry = dayMap.get(r.day);
    entry[`${name}_pass`] = Number(r.pass);
    entry[`${name}_nr`]   = Number(r.nr);
  }

  return {
    days:       [...dayMap.values()],
    zoneNames:  [...zoneNames],
  };
}

module.exports = {
  getEnhancedStats,
  getMessagesTrend,
  getEmailStatusDistribution,
  getDailyRecords,
  getEmailHistory,
  getBusyHours,
  getZoneBreakdown,
  getZonePassRate,
  getZoneDailyTrend,
};
