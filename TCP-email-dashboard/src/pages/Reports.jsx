import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getReportPreview, downloadReport, sendReportEmail, getZonesList } from "../api";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { Badge, Spinner, EmptyState, ErrorState } from "../components/ui/Misc";
import {
  FileDown, Search, BarChart2, CheckCircle2, XCircle,
  Calendar, Filter, RefreshCw, Mail, Send, Clock,
  Image as ImageIcon, ImageOff, X,
} from "lucide-react";

/* ─── helpers ─────────────────────────────────────────── */
function toIST(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", hour12: false,
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function localNow(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60_000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_OPTIONS = [
  { value: "all",  label: "All Status" },
  { value: "PASS", label: "PASS Only"  },
  { value: "NR",   label: "NR Only"    },
];

const EMAIL_SENT_OPTIONS = [
  { value: "all",     label: "All Email Status" },
  { value: "sent",    label: "Email Sent"        },
  { value: "pending", label: "Email Pending"     },
];

const PAGE_SIZE = 20;

const inputClass =
  "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 " +
  "focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-50 shadow-sm transition-all";

/* ─── Stat card ───────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, color }) {
  const colors = {
    blue:    "bg-blue-50    border-blue-100    text-blue-700",
    green:   "bg-green-50   border-green-100   text-green-700",
    red:     "bg-red-50     border-red-100     text-red-700",
    amber:   "bg-amber-50   border-amber-100   text-amber-700",
    emerald: "bg-emerald-50 border-emerald-100 text-emerald-700",
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

/* ─── Image cell ──────────────────────────────────────── */
function ImageCell({ imageName, folderPath, label }) {
  const [exists,   setExists]   = useState(null); // null=loading, true, false
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!imageName || !folderPath) { setExists(false); return; }
    const url = `/api/tcp-image-check?file=${encodeURIComponent(imageName)}&folder=${encodeURIComponent(folderPath)}`;
    fetch(url)
      .then(r => r.json())
      .then(d => setExists(d.exists))
      .catch(() => setExists(false));
  }, [imageName, folderPath]);

  if (!imageName) return <span className="text-slate-300 text-xs">—</span>;

  if (exists === null) {
    return <div className="w-7 h-7 rounded-full bg-slate-200 animate-pulse" />;
  }

  if (!exists) {
    return (
      <div title={`${imageName} — not found`} className="flex items-center gap-1 text-xs text-slate-400">
        <ImageOff size={15} className="text-slate-300" />
        <span className="hidden sm:inline text-[10px]">Not found</span>
      </div>
    );
  }

  const src = `/api/tcp-image?file=${encodeURIComponent(imageName)}&folder=${encodeURIComponent(folderPath)}`;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 transition-colors"
        title={`View ${label} image`}
      >
        <ImageIcon size={12} /> View
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowModal(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setShowModal(false)}
              className="absolute -top-9 right-0 flex items-center gap-1 text-white/80 hover:text-white text-sm"
            >
              <X size={16} /> Close
            </button>
            <p className="text-white/60 text-xs mb-2">{imageName}</p>
            <img
              src={src}
              alt={imageName}
              className="max-w-full max-h-[82vh] rounded-lg shadow-2xl object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Main page ───────────────────────────────────────── */
export default function Reports() {
  const [from,      setFrom]      = useState(() => localNow(-24 * 60));
  const [to,        setTo]        = useState(() => localNow());
  const [status,    setStatus]    = useState("all");
  const [zoneId,    setZoneId]    = useState("");
  const [emailSent, setEmailSent] = useState("all");
  const [barcode,   setBarcode]   = useState("");
  const [page,      setPage]      = useState(1);

  const [committed, setCommitted] = useState({
    from: localNow(-24 * 60), to: localNow(),
    status: "all", zoneId: "", emailSent: "all", barcode: "",
  });

  const [downloading, setDownloading] = useState(false);
  const [dlError,     setDlError]     = useState(null);
  const [emailQueued, setEmailQueued] = useState(false);
  const [emailError,  setEmailError]  = useState(null);

  const { data: zonesData } = useQuery({ queryKey: ["zones-list"], queryFn: getZonesList });

  const emailMutation = useMutation({
    mutationFn: () => sendReportEmail({
      from: committed.from, to: committed.to,
      status: committed.status, zoneId: committed.zoneId || undefined,
    }),
    onSuccess: () => { setEmailQueued(true); setEmailError(null); },
    onError: (err) => setEmailError(err.response?.data?.message || err.message || "Could not queue the email."),
  });

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["reports-preview", committed.from, committed.to, committed.status, committed.zoneId, committed.emailSent, committed.barcode],
    queryFn:  () => getReportPreview({
      from: committed.from, to: committed.to,
      status: committed.status,
      zoneId: committed.zoneId || undefined,
      emailSent: committed.emailSent,
      barcode: committed.barcode || undefined,
    }),
    enabled: !!(committed.from && committed.to),
  });

  const allRecords   = data?.records ?? [];
  const total        = data?.total   ?? 0;
  const pass         = data?.pass    ?? 0;
  const nr           = data?.nr      ?? 0;
  const sent         = data?.sent    ?? 0;
  const pending      = data?.pending ?? 0;
  const truncated    = data?.truncated    ?? false;
  const previewLimit = data?.previewLimit ?? 500;

  // Client-side pagination over capped preview records
  const totalPages   = Math.ceil(allRecords.length / PAGE_SIZE) || 1;
  const pageRecords  = allRecords.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const applyFilter = () => {
    if (!from || !to) return;
    setPage(1);
    setCommitted({ from, to, status, zoneId, emailSent, barcode });
  };

  const handleDownload = async () => {
    if (!committed.from || !committed.to) return;
    setDownloading(true); setDlError(null);
    try {
      const res = await downloadReport({
        from: committed.from, to: committed.to, status: committed.status,
        ...(committed.zoneId ? { zoneId: committed.zoneId } : {}),
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/zip" }));
      const a   = document.createElement("a");
      a.href    = url;
      a.download = `TCP_Report_${new Date().toISOString().slice(0,16).replace(/[-T:]/g,"")}.zip`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (err) {
      setDlError(err.response?.status === 404 ? "No records found for the selected date range." : "Download failed. Please try again.");
    } finally { setDownloading(false); }
  };

  return (
    <div className="space-y-5">

      {/* ── Page title ─────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100">
          <BarChart2 size={20} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-800">Reports</h1>
          <p className="text-xs text-slate-500">Filter, preview, download and email cycle reports</p>
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────── */}
      <Card className="p-5">
        <div className="flex flex-wrap items-end gap-3">

          {/* From */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Calendar size={11} /> From</label>
            <input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} className={inputClass} />
          </div>

          {/* To */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Calendar size={11} /> To</label>
            <input type="datetime-local" value={to} onChange={e => setTo(e.target.value)} className={inputClass} />
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Filter size={11} /> Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className={inputClass + " cursor-pointer"}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Zone */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Filter size={11} /> Zone</label>
            <select value={zoneId} onChange={e => setZoneId(e.target.value)} className={inputClass + " cursor-pointer"}>
              <option value="">All Zones</option>
              {(zonesData ?? []).map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>

          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Mail size={11} /> Email</label>
            <select value={emailSent} onChange={e => setEmailSent(e.target.value)} className={inputClass + " cursor-pointer"}>
              {EMAIL_SENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Barcode starts-with search */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Search size={11} /> Barcode (starts with)</label>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={barcode}
                onChange={e => setBarcode(e.target.value)}
                onKeyDown={e => e.key === "Enter" && applyFilter()}
                placeholder="e.g. ABC123"
                className={inputClass + " pl-8 w-40"}
              />
              {barcode && (
                <button onClick={() => setBarcode("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pb-0.5">
            <Button onClick={applyFilter} disabled={!from || !to || isFetching}>
              {isFetching ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />}
              {isFetching ? "Loading…" : "Apply"}
            </Button>
            <Button variant="success" onClick={handleDownload} disabled={downloading || total === 0}>
              {downloading ? <RefreshCw size={14} className="animate-spin" /> : <FileDown size={14} />}
              {downloading ? "Preparing…" : `Download (${total})`}
            </Button>
            <Button variant="primary"
              onClick={() => { setEmailQueued(false); setEmailError(null); emailMutation.mutate(); }}
              disabled={emailMutation.isPending || total === 0}
            >
              {emailMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
              {emailMutation.isPending ? "Queuing…" : `Email (${total})`}
            </Button>
          </div>
        </div>

        {/* Feedback banners */}
        {dlError && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{dlError}</p>
        )}
        {emailError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm border bg-red-50 border-red-100 text-red-600">
            <XCircle size={16} className="mt-0.5 shrink-0" />
            <span>{emailError}</span>
            <button onClick={() => setEmailError(null)} className="ml-auto opacity-50 hover:opacity-100 font-bold">×</button>
          </div>
        )}
        {emailQueued && (
          <div className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm border bg-blue-50 border-blue-100 text-blue-700">
            <Mail size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Report queued — you're all set!</p>
              <p className="mt-0.5 text-blue-600 text-xs">The server is building and sending the email in the background. It may take a few minutes.</p>
            </div>
            <button onClick={() => setEmailQueued(false)} className="ml-auto opacity-50 hover:opacity-100 font-bold shrink-0">×</button>
          </div>
        )}
      </Card>

      {/* ── Summary stats ──────────────────────────────────── */}
      {total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <StatCard icon={BarChart2}    label="Total Tote"  value={total}   color="blue"    />
          <StatCard icon={CheckCircle2} label="PASS"        value={pass}    color="green"   />
          <StatCard icon={XCircle}      label="NR"          value={nr}      color="red"     />
          <StatCard icon={Mail}         label="Email Sent"  value={sent}    color="emerald" />
          <StatCard icon={Clock}        label="Pending"     value={pending} color="amber"   />
        </div>
      )}

      {/* ── Truncation notice ──────────────────────────────── */}
      {truncated && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
          <Filter size={14} className="shrink-0" />
          Preview shows first <span className="font-semibold mx-1">{previewLimit.toLocaleString()}</span> of
          <span className="font-semibold mx-1">{total.toLocaleString()}</span> records.
          All records are included in Download ZIP and Email Report.
        </div>
      )}

      {/* ── Table ──────────────────────────────────────────── */}
      <Card className="overflow-hidden p-0">
        {isLoading || isFetching ? (
          <div className="p-8 flex justify-center"><Spinner /></div>
        ) : isError ? (
          <div className="p-6"><ErrorState message="Failed to load report data" /></div>
        ) : allRecords.length === 0 ? (
          <div className="p-8"><EmptyState message="No records found. Select a date range and click Apply." /></div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                    <th className="px-4 py-3 font-semibold w-10">#</th>
                    <th className="px-4 py-3 font-semibold w-28">Zone</th>
                    <th className="px-4 py-3 font-semibold w-40">Scan Time</th>
                    <th className="px-4 py-3 font-semibold w-16">Status</th>
                    <th className="px-4 py-3 font-semibold">Barcode(s)</th>
                    <th className="px-4 py-3 font-semibold w-24">OK Image</th>
                    <th className="px-4 py-3 font-semibold w-24">NR Image</th>
                    <th className="px-4 py-3 font-semibold w-24">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {pageRecords.map((r, idx) => (
                    <tr key={r.id} className={`transition-colors ${r.status === "PASS" ? "bg-green-50/40 hover:bg-green-50" : "bg-red-50/30 hover:bg-red-50"}`}>
                      <td className="px-4 py-2.5 text-xs text-slate-400">
                        {(page - 1) * PAGE_SIZE + idx + 1}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                          {r.zone_name || `Zone ${r.zone_id}`}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{toIST(r.started_at)}</td>
                      <td className="px-4 py-2.5">
                        <Badge color={r.status === "PASS" ? "green" : "red"}>{r.status}</Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        {r.barcode
                          ? r.barcode.split("|").map((b, i) => (
                              <span key={i} className="inline-flex items-center mr-1 mb-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-700 border border-violet-100">
                                {b.trim()}
                              </span>
                            ))
                          : <span className="text-slate-400 text-xs">—</span>
                        }
                      </td>
                      {/* OK Image */}
                      <td className="px-4 py-2.5">
                        <ImageCell
                          imageName={r.status === "PASS" ? r.image_name : null}
                          folderPath={r.folder_path_ok}
                          label="OK"
                        />
                      </td>
                      {/* NR Image */}
                      <td className="px-4 py-2.5">
                        <ImageCell
                          imageName={r.status === "NR" ? r.image_name : null}
                          folderPath={r.folder_path_nr}
                          label="NR"
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        {r.email_sent == 1 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                            <Mail size={11} /> Sent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                            <Clock size={11} /> Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Pagination + footer ─────────────────────── */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs text-slate-500">
              <span>
                {allRecords.length.toLocaleString()} records
                &nbsp;·&nbsp; PASS: <span className="font-semibold text-green-600">{pass}</span>
                &nbsp;·&nbsp; NR: <span className="font-semibold text-red-500">{nr}</span>
                &nbsp;·&nbsp; Sent: <span className="font-semibold text-emerald-600">{sent}</span>
                &nbsp;·&nbsp; Pending: <span className="font-semibold text-amber-600">{pending}</span>
              </span>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(1)}>«</Button>
                <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹ Prev</Button>
                <span className="px-3 py-1 rounded-md bg-white border border-slate-200 text-slate-700 font-semibold shadow-sm">
                  {page} / {totalPages}
                </span>
                <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next ›</Button>
                <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage(totalPages)}>»</Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
