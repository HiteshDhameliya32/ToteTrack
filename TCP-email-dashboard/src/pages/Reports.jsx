import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getReportPreview, downloadReport, sendReportEmail } from "../api";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { Badge, Spinner, EmptyState, ErrorState } from "../components/ui/Misc";
import {
  FileDown, Search, BarChart2, CheckCircle2, XCircle,
  Calendar, Filter, RefreshCw, Mail, Send,
} from "lucide-react";

/* ─── helpers ─────────────────────────────────────────── */
function toIST(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: false,
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function localNow(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  // Format as YYYY-MM-DDTHH:mm (datetime-local value)
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

const STATUS_OPTIONS = [
  { value: "all",  label: "All Status" },
  { value: "PASS", label: "PASS Only" },
  { value: "NR",   label: "NR Only"   },
];

const inputClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 " +
  "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-50 shadow-sm transition-all";

/* ─── Summary card ────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue:  "bg-blue-50  border-blue-100  text-blue-700",
    green: "bg-green-50 border-green-100 text-green-700",
    red:   "bg-red-50   border-red-100   text-red-700",
  };
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-4 ${colors[color]}`}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/70">
        <Icon size={20} />
      </div>
      <div>
        <p className="text-xs font-medium opacity-70">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────── */
export default function Reports() {
  // Default: today 00:00 → now
  const [from,       setFrom]       = useState(() => localNow(-24 * 60)); // 24h ago
  const [to,         setTo]         = useState(() => localNow());
  const [status,     setStatus]     = useState("all");
  const [committed,  setCommitted]  = useState({ from: localNow(-24 * 60), to: localNow(), status: "all" });
  const [downloading, setDownloading] = useState(false);
  const [dlError,    setDlError]    = useState(null);

  // Email mutation — fire-and-forget: backend returns 202 instantly
  const [emailQueued, setEmailQueued] = useState(false); // shows the "we're sending" banner
  const [emailError,  setEmailError]  = useState(null);

  const emailMutation = useMutation({
    mutationFn: () => sendReportEmail({ from: committed.from, to: committed.to, status: committed.status }),
    onSuccess: () => {
      // 202 accepted — backend is processing in background
      setEmailQueued(true);
      setEmailError(null);
    },
    onError: (err) => {
      const msg = err.response?.data?.message || err.message || "Could not queue the email. Please try again.";
      setEmailError(msg);
    },
  });

  // Preview query — only fires when user clicks "Apply"
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["reports-preview", committed.from, committed.to, committed.status],
    queryFn:  () => getReportPreview({ from: committed.from, to: committed.to, status: committed.status }),
    enabled:  !!(committed.from && committed.to),
  });

  const records = data?.records ?? [];
  const total   = data?.total   ?? 0;
  const pass    = data?.pass    ?? 0;
  const nr      = data?.nr      ?? 0;

  const applyFilter = () => {
    if (!from || !to) return;
    setCommitted({ from, to, status });
  };

  const handleDownload = async () => {
    if (!committed.from || !committed.to) return;
    setDownloading(true);
    setDlError(null);
    try {
      const res = await downloadReport({
        from: committed.from,
        to:   committed.to,
        status: committed.status,
      });

      // Build a download link from the blob
      const url      = URL.createObjectURL(new Blob([res.data], { type: "application/zip" }));
      const a        = document.createElement("a");
      const ts       = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, "");
      a.href         = url;
      a.download     = `TCP_Report_${ts}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      const isNoData = err.response?.status === 404;
      setDlError(isNoData ? "No records found for the selected date range." : "Download failed. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* ── Page title ──────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100">
            <BarChart2 size={20} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800">Reports</h1>
            <p className="text-xs text-slate-500">Filter by date range and download Excel + NR images as ZIP</p>
          </div>
        </div>
      </div>

      {/* ── Filter bar ──────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex flex-wrap items-end gap-4">
          {/* From */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Calendar size={12} /> From
            </label>
            <input
              type="datetime-local"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* To */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Calendar size={12} /> To
            </label>
            <input
              type="datetime-local"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Filter size={12} /> Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={inputClass + " cursor-pointer"}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2 pb-0.5">
            <Button onClick={applyFilter} disabled={!from || !to || isFetching}>
              {isFetching ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
              {isFetching ? "Loading…" : "Apply Filter"}
            </Button>

            <Button
              variant="success"
              onClick={handleDownload}
              disabled={downloading || total === 0}
              title={total === 0 ? "Apply filter first to load records" : `Download ${total} records as ZIP`}
            >
              {downloading
                ? <RefreshCw size={14} className="animate-spin" />
                : <FileDown size={14} />}
              {downloading ? "Preparing…" : `Download ZIP (${total})`}
            </Button>

            <Button
              variant="primary"
              onClick={() => { setEmailQueued(false); setEmailError(null); emailMutation.mutate(); }}
              disabled={emailMutation.isPending || total === 0}
              title={total === 0 ? "Apply filter first to load records" : "Email report to all recipients"}
            >
              {emailMutation.isPending
                ? <RefreshCw size={14} className="animate-spin" />
                : <Send size={14} />}
              {emailMutation.isPending ? "Queuing…" : `Email Report (${total})`}
            </Button>
          </div>
        </div>

        {/* Error feedback */}
        {dlError && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {dlError}
          </p>
        )}

        {/* Email error */}
        {emailError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm border bg-red-50 border-red-100 text-red-600">
            <XCircle size={16} className="mt-0.5 shrink-0" />
            <span>{emailError}</span>
            <button onClick={() => setEmailError(null)} className="ml-auto opacity-50 hover:opacity-100 font-bold">×</button>
          </div>
        )}

        {/* Email queued — stays visible so user knows it's processing */}
        {emailQueued && (
          <div className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm border bg-blue-50 border-blue-100 text-blue-700">
            <Mail size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Report is being prepared — you're all set!</p>
              <p className="mt-0.5 text-blue-600">
                The server is zipping the data and sending the email in the background.
                This may take 2–5 minutes. You can continue scanning or leave this page — the email will arrive in your inbox automatically.
              </p>
            </div>
            <button onClick={() => setEmailQueued(false)} className="ml-auto opacity-50 hover:opacity-100 font-bold shrink-0">×</button>
          </div>
        )}

        {/* Download note */}
        <p className="mt-3 text-xs text-slate-400">
          ZIP contains <span className="font-medium text-slate-500">report.xlsx</span> (all cycles) +{" "}
          <span className="font-medium text-slate-500">images/</span> folder (NR cycles only).
          PASS records do not include images. Use <span className="font-medium text-slate-500">Email Report</span> to send directly to all configured recipients.
        </p>
      </Card>

      {/* ── Summary stats ───────────────────────────────────── */}
      {total > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard icon={BarChart2}    label="Total Tote" value={total} color="blue"  />
          <StatCard icon={CheckCircle2} label="PASS"         value={pass}  color="green" />
          <StatCard icon={XCircle}      label="NR"           value={nr}    color="red"   />
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────── */}
      <Card className="overflow-hidden p-0">
        {isLoading || isFetching ? (
          <div className="p-8 flex justify-center"><Spinner /></div>
        ) : isError ? (
          <div className="p-6"><ErrorState message="Failed to load report data" /></div>
        ) : records.length === 0 ? (
          <div className="p-8">
            <EmptyState message="No records found. Select a date range and click Apply Filter." />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-3 font-semibold w-10">#</th>
                    <th className="px-4 py-3 font-semibold w-32">Location</th>
                    <th className="px-4 py-3 font-semibold w-44">Scan Time</th>
                    <th className="px-4 py-3 font-semibold w-20">Status</th>
                    <th className="px-4 py-3 font-semibold">Barcode(s)</th>
                    <th className="px-4 py-3 font-semibold w-28">Image</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {records.map((r, idx) => (
                    <tr
                      key={r.id}
                      className={`transition-colors ${
                        r.status === "PASS"
                          ? "bg-green-50/40 hover:bg-green-50"
                          : "bg-red-50/30 hover:bg-red-50"
                      }`}
                    >
                      {/* # */}
                      <td className="px-4 py-3 text-xs text-slate-400">{idx + 1}</td>

                      {/* Location — user-defined zone name */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                          {r.zone_name || `Zone ${r.zone_id}`}
                        </span>
                      </td>

                      {/* Scan Time */}
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{toIST(r.started_at)}</td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <Badge color={r.status === "PASS" ? "green" : "red"}>
                          {r.status}
                        </Badge>
                      </td>

                      {/* Barcode(s) */}
                      <td className="px-4 py-3">
                        {r.barcode
                          ? r.barcode.split("|").map((b, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center mr-1 mb-1 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100"
                              >
                                {b.trim()}
                              </span>
                            ))
                          : <span className="text-slate-400 text-xs">—</span>
                        }
                      </td>

                      {/* Image — only for NR */}
                      <td className="px-4 py-3 text-xs">
                        {r.status === "NR" && r.image_name
                          ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                              📷 {r.image_name}
                            </span>
                          )
                          : <span className="text-slate-300">—</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer count */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs text-slate-500">
              <span>
                Showing <span className="font-semibold text-slate-700">{records.length}</span> records
                &nbsp;·&nbsp; PASS: <span className="font-semibold text-green-600">{pass}</span>
                &nbsp;·&nbsp; NR: <span className="font-semibold text-red-500">{nr}</span>
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="success"
                  onClick={handleDownload}
                  disabled={downloading || total === 0}
                >
                  {downloading ? <RefreshCw size={12} className="animate-spin" /> : <FileDown size={12} />}
                  {downloading ? "Preparing…" : "Download ZIP"}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => { setEmailQueued(false); setEmailError(null); emailMutation.mutate(); }}
                  disabled={emailMutation.isPending || total === 0}
                >
                  {emailMutation.isPending ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                  {emailMutation.isPending ? "Queuing…" : "Email Report"}
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
