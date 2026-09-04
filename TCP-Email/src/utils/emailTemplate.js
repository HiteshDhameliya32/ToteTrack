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
 * Rich HTML email for manual date-range report.
 * Shows summary stats + full cycle table. ZIP is sent as attachment.
 */
function buildReportEmailHtml({ rows, fromLabel, toLabel, total, pass, nr, recipientCount }) {
  const passRate = total > 0 ? Math.round((pass / total) * 100) : 0;

  // Build table rows — max 200 shown inline, rest are in the Excel
  const MAX_INLINE = 200;
  const inlineRows = rows.slice(0, MAX_INLINE);
  const truncated  = rows.length > MAX_INLINE;

  function toIST(dt) {
    if (!dt) return "—";
    return new Date(dt).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata", hour12: false,
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const tableRows = inlineRows.map((r, i) => {
    const isPass   = r.status === "PASS";
    const rowBg    = i % 2 === 0 ? "#f9fafb" : "#ffffff";
    const statusBg = isPass ? "#d1fae5" : "#fee2e2";
    const statusFg = isPass ? "#065f46" : "#991b1b";
    const barcode  = r.barcode ? String(r.barcode).replace(/\|/g, " | ") : "—";
    const imgCell  = !isPass && r.image_name ? r.image_name : "—";

    return `
    <tr style="background:${rowBg}">
      <td style="padding:7px 10px;border:1px solid #e5e7eb;color:#6b7280;font-size:12px">${i + 1}</td>
      <td style="padding:7px 10px;border:1px solid #e5e7eb;font-size:12px">Zone ${r.zone_id}</td>
      <td style="padding:7px 10px;border:1px solid #e5e7eb;font-size:12px;white-space:nowrap">${toIST(r.started_at)}</td>
      <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center">
        <span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;background:${statusBg};color:${statusFg}">${r.status}</span>
      </td>
      <td style="padding:7px 10px;border:1px solid #e5e7eb;font-size:12px;max-width:260px;word-break:break-word">${barcode}</td>
      <td style="padding:7px 10px;border:1px solid #e5e7eb;font-size:12px;color:#92400e">${imgCell}</td>
    </tr>`;
  }).join("");

  const truncNote = truncated
    ? `<tr><td colspan="6" style="padding:10px;text-align:center;background:#fef9c3;border:1px solid #e5e7eb;font-size:12px;color:#854d0e">
        Showing first ${MAX_INLINE} of ${total} records. Full data is in the attached Excel file.
       </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>ToteTrack Report</title></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f1f5f9">

  <div style="max-width:860px;margin:32px auto;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10)">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);padding:28px 36px">
      <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.3px">
        📊 ToteTrack Report
      </h1>
      <p style="margin:6px 0 0;color:#bfdbfe;font-size:14px">
        Period: <strong style="color:#e0f2fe">${fromLabel}</strong>
        &nbsp;→&nbsp;
        <strong style="color:#e0f2fe">${toLabel}</strong>
      </p>
      <p style="margin:4px 0 0;color:#93c5fd;font-size:12px">
        Generated ${new Date().toLocaleString("en-IN", { timeZone:"Asia/Kolkata", hour12:false })} IST
      </p>
    </div>

    <!-- Summary cards (table-based for email clients) -->
    <div style="padding:24px 36px 8px">
      <table style="width:100%;border-collapse:separate;border-spacing:12px 0">
        <tr>
          <!-- Total -->
          <td style="width:33%;background:#eff6ff;border-radius:10px;padding:18px;text-align:center;border:1px solid #bfdbfe">
            <div style="font-size:36px;font-weight:800;color:#1e40af;line-height:1">${total}</div>
            <div style="font-size:12px;color:#3b82f6;font-weight:600;margin-top:6px;text-transform:uppercase;letter-spacing:.5px">Total Tote</div>
          </td>
          <!-- PASS -->
          <td style="width:33%;background:#f0fdf4;border-radius:10px;padding:18px;text-align:center;border:1px solid #bbf7d0">
            <div style="font-size:36px;font-weight:800;color:#15803d;line-height:1">${pass}</div>
            <div style="font-size:12px;color:#16a34a;font-weight:600;margin-top:6px;text-transform:uppercase;letter-spacing:.5px">✅ PASS</div>
            <div style="font-size:11px;color:#4ade80;margin-top:2px">${passRate}% pass rate</div>
          </td>
          <!-- NR -->
          <td style="width:33%;background:#fff1f2;border-radius:10px;padding:18px;text-align:center;border:1px solid #fecdd3">
            <div style="font-size:36px;font-weight:800;color:#b91c1c;line-height:1">${nr}</div>
            <div style="font-size:12px;color:#dc2626;font-weight:600;margin-top:6px;text-transform:uppercase;letter-spacing:.5px">❌ NR</div>
            <div style="font-size:11px;color:#f87171;margin-top:2px">${100 - passRate}% no-read rate</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- Attachment note -->
    <div style="margin:16px 36px;padding:12px 16px;background:#f0f9ff;border-left:4px solid #0ea5e9;border-radius:4px">
      <p style="margin:0;font-size:13px;color:#0369a1">
        📎 <strong>Attached:</strong> report.zip contains <code>report.xlsx</code> (all ${total} cycles)
        ${nr > 0 ? `+ <code>images/</code> folder with <strong>${nr} NR tote image${nr !== 1 ? "s" : ""}</strong>` : "(no NR images — all cycles passed)"}
      </p>
    </div>

    <!-- Cycle table -->
    <div style="padding:0 36px 24px">
      <h2 style="font-size:15px;font-weight:700;color:#1e293b;margin:0 0 12px">Cycle Details</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#1e40af;color:#ffffff">
            <th style="padding:9px 10px;border:1px solid #1e40af;text-align:left;font-weight:600">#</th>
            <th style="padding:9px 10px;border:1px solid #1e40af;text-align:left;font-weight:600">Zone</th>
            <th style="padding:9px 10px;border:1px solid #1e40af;text-align:left;font-weight:600">Scan Time</th>
            <th style="padding:9px 10px;border:1px solid #1e40af;text-align:center;font-weight:600">Status</th>
            <th style="padding:9px 10px;border:1px solid #1e40af;text-align:left;font-weight:600">Barcode(s)</th>
            <th style="padding:9px 10px;border:1px solid #1e40af;text-align:left;font-weight:600">Image File</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
          ${truncNote}
        </tbody>
      </table>
    </div>

    <!-- Footer brand -->
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb;background:#f8fafc">
      <tr>
        <td style="padding:18px 36px">
          <div style="font-size:15px;font-weight:700;color:#1e293b;font-family:Arial,sans-serif">
            Pixcels<span style="color:#4f46e5">Themes</span>
          </div>
          <div style="font-size:11px;color:#64748b;margin-top:3px">Innovative IT &amp; Automation Solutions</div>
        </td>
        <td style="padding:18px 36px;text-align:right">
          <a href="https://www.pixcelsthemes.com/" style="display:inline-block;padding:7px 14px;background:#fff;color:#4f46e5;text-decoration:none;font-size:12px;font-weight:700;border:1px solid #e2e8f0;border-radius:6px">
            Visit Website
          </a>
        </td>
      </tr>
    </table>

    <!-- Bottom bar -->
    <div style="background:#1e293b;padding:12px 36px;text-align:center;font-size:11px;color:#64748b">
      This report was sent to ${recipientCount} recipient${recipientCount !== 1 ? "s" : ""} · ToteTrack System
    </div>

  </div>
</body>
</html>`;
}

module.exports = { buildEmailHtml: buildEmailHtml, buildReportEmailHtml };
