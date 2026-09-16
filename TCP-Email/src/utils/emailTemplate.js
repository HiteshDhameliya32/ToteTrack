function buildEmailHtml({ records, dateFrom, dateTo }) {
  const rows = records
    .map(
      (r, i) => `
      <tr style="background:${i % 2 === 0 ? "#f9fafb" : "#ffffff"}">
        <td style="padding:8px 12px;border:1px solid #e5e7eb">${r.id}</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb">${r.received_at}</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;max-width:400px;word-break:break-word">${r.message}</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;max-width:300px;word-break:break-word">${r.barcode ? String(r.barcode).replace(/\|/g, ' | ') : '—'}</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>ToteTrack Report</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f3f4f6">
  <div style="max-width:800px;margin:32px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
    <div style="background:#1e40af;padding:24px 32px">
      <h1 style="margin:0;color:#ffffff;font-size:22px">ToteTrack Message Report</h1>
      <p style="margin:4px 0 0;color:#bfdbfe;font-size:14px">${dateFrom} → ${dateTo}</p>
    </div>
    <div style="padding:24px 32px">
      <div style="display:flex;gap:16px;margin-bottom:24px">
        <div style="flex:1;background:#eff6ff;border-radius:8px;padding:16px;text-align:center">
          <div style="font-size:32px;font-weight:700;color:#1e40af">${records.length}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:4px">Total Records</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#1e40af;color:#ffffff">
            <th style="padding:10px 12px;border:1px solid #e5e7eb;text-align:left">ID</th>
            <th style="padding:10px 12px;border:1px solid #e5e7eb;text-align:left">Received At</th>
            <th style="padding:10px 12px;border:1px solid #e5e7eb;text-align:left">Message</th>
            <th style="padding:10px 12px;border:1px solid #e5e7eb;text-align:left">Barcode</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb;background:#ffffff;">
      <tr>
        <td style="padding:20px 32px;text-align:left;">
          <div style="font-size:16px;font-weight:bold;color:#1e293b;margin:0;font-family:Arial,sans-serif;">Pixcels<span style="color:#4f46e5;">Themes</span></div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;font-family:Arial,sans-serif;">Innovative IT &amp; Automation Solutions for Your Business</div>
        </td>
        <td style="padding:20px 32px;text-align:right;">
          <a href="https://www.pixcelsthemes.com/" style="display:inline-block;padding:8px 16px;background:#f8fafc;color:#4f46e5;text-decoration:none;font-size:13px;font-weight:bold;border:1px solid #e2e8f0;border-radius:6px;font-family:Arial,sans-serif;">Visit Website</a>
        </td>
      </tr>
    </table>
    <div style="background:#f9fafb;padding:16px 32px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">
      Generated at ${new Date().toISOString()} · ToteTrack System
    </div>
  </div>
</body>
</html>`;
}


/**
 * Rich HTML email — summary stats only, zone-wise cards.
 * No data table — all data is in the attached Excel/ZIP.
 *
 * @param {object} opts
 * @param {Array}  opts.rows           - all cycle rows (used to compute per-zone stats)
 * @param {string} opts.fromLabel
 * @param {string} opts.toLabel
 * @param {number} opts.total
 * @param {number} opts.pass
 * @param {number} opts.nr
 * @param {number} opts.recipientCount
 */
function buildReportEmailHtml({ rows, fromLabel, toLabel, total, pass, nr, recipientCount, includeImages = true }) {
  const passRate = total > 0 ? Math.round((pass / total) * 100) : 0;

  // ── Build per-zone stats ──────────────────────────────────────────────────
  const zoneMap = new Map();
  for (const r of (rows || [])) {
    const name = r.zone_name || `Zone ${r.zone_id}`;
    if (!zoneMap.has(name)) zoneMap.set(name, { total: 0, pass: 0, nr: 0 });
    const z = zoneMap.get(name);
    z.total++;
    if (r.status === "PASS") z.pass++;
    if (r.status === "NR")   z.nr++;
  }

  // ── Zone cards HTML ───────────────────────────────────────────────────────
  const zoneCardsHtml = zoneMap.size > 0
    ? [...zoneMap.entries()].map(([zoneName, z]) => {
        const zRate = z.total > 0 ? Math.round((z.pass / z.total) * 100) : 0;
        return `
        <table style="width:100%;border-collapse:collapse;margin-bottom:12px;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
          <tr style="background:#1e40af">
            <td colspan="3" style="padding:10px 16px">
              <span style="color:#ffffff;font-size:14px;font-weight:700">${zoneName}</span>
              <span style="color:#93c5fd;font-size:12px;margin-left:8px">${z.total} tote</span>
            </td>
          </tr>
          <tr>
            <td style="width:33%;padding:14px 12px;text-align:center;background:#eff6ff;border-right:1px solid #e2e8f0">
              <div style="font-size:28px;font-weight:800;color:#1e40af;line-height:1">${z.total}</div>
              <div style="font-size:11px;color:#3b82f6;font-weight:600;margin-top:4px;text-transform:uppercase">Total</div>
            </td>
            <td style="width:33%;padding:14px 12px;text-align:center;background:#f0fdf4;border-right:1px solid #e2e8f0">
              <div style="font-size:28px;font-weight:800;color:#15803d;line-height:1">${z.pass}</div>
              <div style="font-size:11px;color:#16a34a;font-weight:600;margin-top:4px;text-transform:uppercase">&#10003; PASS</div>
              <div style="font-size:10px;color:#4ade80;margin-top:2px">${zRate}%</div>
            </td>
            <td style="width:33%;padding:14px 12px;text-align:center;background:#fff1f2">
              <div style="font-size:28px;font-weight:800;color:#b91c1c;line-height:1">${z.nr}</div>
              <div style="font-size:11px;color:#dc2626;font-weight:600;margin-top:4px;text-transform:uppercase">&#10007; NR</div>
              <div style="font-size:10px;color:#f87171;margin-top:2px">${100 - zRate}%</div>
            </td>
          </tr>
        </table>`;
      }).join("")
    : `<p style="color:#94a3b8;font-size:13px;text-align:center;padding:16px 0">No zone data available.</p>`;

  // ── Attachment note ───────────────────────────────────────────────────────
  const sheetList = zoneMap.size > 0
    ? [...zoneMap.keys()].map(n => `<code style="background:#e0f2fe;padding:1px 5px;border-radius:3px;font-size:12px">${n}</code>`).join(" &nbsp;")
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>ToteTrack Report</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f1f5f9">
<div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10)">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:28px 36px">
    <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700">&#128202; ToteTrack Report</h1>
    <p style="margin:6px 0 0;color:#bfdbfe;font-size:14px">
      Period: <strong style="color:#e0f2fe">${fromLabel || "—"}</strong>
      &nbsp;&#8594;&nbsp;
      <strong style="color:#e0f2fe">${toLabel || "—"}</strong>
    </p>
    <p style="margin:4px 0 0;color:#93c5fd;font-size:12px">
      Generated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })} IST
    </p>
  </div>

  <!-- Overall totals -->
  <div style="padding:24px 36px 8px">
    <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.5px">Overall Summary</p>
    <table style="width:100%;border-collapse:separate;border-spacing:8px 0">
      <tr>
        <td style="width:33%;background:#eff6ff;border-radius:8px;padding:16px;text-align:center;border:1px solid #bfdbfe">
          <div style="font-size:32px;font-weight:800;color:#1e40af;line-height:1">${total}</div>
          <div style="font-size:11px;color:#3b82f6;font-weight:600;margin-top:5px;text-transform:uppercase">Total Tote</div>
        </td>
        <td style="width:33%;background:#f0fdf4;border-radius:8px;padding:16px;text-align:center;border:1px solid #bbf7d0">
          <div style="font-size:32px;font-weight:800;color:#15803d;line-height:1">${pass}</div>
          <div style="font-size:11px;color:#16a34a;font-weight:600;margin-top:5px;text-transform:uppercase">&#10003; PASS</div>
          <div style="font-size:10px;color:#4ade80;margin-top:2px">${passRate}% pass rate</div>
        </td>
        <td style="width:33%;background:#fff1f2;border-radius:8px;padding:16px;text-align:center;border:1px solid #fecdd3">
          <div style="font-size:32px;font-weight:800;color:#b91c1c;line-height:1">${nr}</div>
          <div style="font-size:11px;color:#dc2626;font-weight:600;margin-top:5px;text-transform:uppercase">&#10007; NR</div>
          <div style="font-size:10px;color:#f87171;margin-top:2px">${100 - passRate}% no-read rate</div>
        </td>
      </tr>
    </table>
  </div>

  <!-- Zone-wise breakdown -->
  <div style="padding:20px 36px 8px">
    <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.5px">Zone Breakdown</p>
    ${zoneCardsHtml}
  </div>

  <!-- Attachment note -->
  <div style="margin:8px 36px 24px;padding:14px 18px;background:#f0f9ff;border-left:4px solid #0ea5e9;border-radius:4px">
    <p style="margin:0;font-size:13px;color:#0369a1">
      &#128206; <strong>Attached:</strong> <code style="background:#e0f2fe;padding:1px 5px;border-radius:3px">ToteTrack_Report_[date].xlsx</code>
      with ${zoneMap.size > 0 ? `${zoneMap.size} zone sheet${zoneMap.size > 1 ? "s" : ""}: ${sheetList}` : "no data"}
      ${includeImages && nr > 0
        ? ` &nbsp;+&nbsp; <code style="background:#e0f2fe;padding:1px 5px;border-radius:3px">images/</code> folder with <strong>${nr} NR image${nr !== 1 ? "s" : ""}</strong>`
        : nr > 0
          ? ` &nbsp;&mdash;&nbsp; <span style="color:#b45309">NR images not attached (${total} records &gt; 1500 limit). Use the Reports page Download button to get images.</span>`
          : " (no NR images)"
      }
    </p>
  </div>

  <!-- Footer -->
  <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb;background:#f8fafc">
    <tr>
      <td style="padding:16px 36px">
        <div style="font-size:14px;font-weight:700;color:#1e293b">Pixcels<span style="color:#4f46e5">Themes</span></div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">Innovative IT &amp; Automation Solutions</div>
      </td>
      <td style="padding:16px 36px;text-align:right">
        <a href="https://www.pixcelsthemes.com/" style="display:inline-block;padding:7px 14px;background:#fff;color:#4f46e5;text-decoration:none;font-size:12px;font-weight:700;border:1px solid #e2e8f0;border-radius:6px">Visit Website</a>
      </td>
    </tr>
  </table>
  <div style="background:#1e293b;padding:10px 36px;text-align:center;font-size:11px;color:#64748b">
    Sent to ${recipientCount} recipient${recipientCount !== 1 ? "s" : ""} &middot; ToteTrack System
  </div>

</div>
</body>
</html>`;
}

module.exports = { buildEmailHtml: buildEmailHtml, buildReportEmailHtml };
