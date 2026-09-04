import { useState } from "react";
import { Plus, X, Loader2, Wifi, Network } from "lucide-react";
import { updateTcpClientConfig } from "../api";
import { useAuth } from "../store/AuthContext";

const IP_REGEX  = /^(\d{1,3}\.){3}\d{1,3}$/;
const emptyPair = () => ({ host: "", port1: "", port2: "", folder_path: "" });
const validPort = v => { const n = Number(v); return v !== "" && Number.isInteger(n) && n >= 1 && n <= 65535; };

export default function TcpSetupModal() {
  const { setTcpConfigured } = useAuth();

  // Each element = one pair row: { host, port1, port2, folder_path }
  const [pairs,   setPairs]   = useState([emptyPair()]);
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [errors,  setErrors]  = useState({});

  function update(idx, field, value) {
    setPairs(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
    setErrors(prev => { const n = { ...prev }; delete n[idx]; return n; });
    setSaveErr("");
  }

  function removePair(idx) {
    setPairs(prev => prev.length === 1 ? [emptyPair()] : prev.filter((_, i) => i !== idx));
    setErrors(prev => {
      const n = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki !== idx) n[ki > idx ? ki - 1 : ki] = v;
      });
      return n;
    });
  }

  function addPair() {
    setPairs(prev => [...prev, emptyPair()]);
  }

  async function handleSave() {
    setSaveErr("");
    const errs = {};
    const valid = [];

    pairs.forEach((p, i) => {
      const hasAny = p.host.trim() || p.port1.toString().trim() || p.port2.toString().trim();
      if (!hasAny) return;

      if (!p.host.trim())                { errs[i] = "IP address is required"; return; }
      if (!IP_REGEX.test(p.host.trim())) { errs[i] = "Invalid IP (e.g. 192.168.1.10)"; return; }
      if (!validPort(p.port1))           { errs[i] = "Port 1 must be 1–65535"; return; }
      if (!validPort(p.port2))           { errs[i] = "Port 2 must be 1–65535"; return; }
      if (String(p.port1) === String(p.port2)) { errs[i] = "Port 1 and Port 2 must be different"; return; }
      valid.push(p);
    });

    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (valid.length === 0)       { setSaveErr("Add at least one complete pair before saving."); return; }

    setSaving(true);
    try {
      await updateTcpClientConfig({
        configs: valid.map(p => ({
          host:        p.host.trim(),
          port1:       Number(p.port1),
          port2:       Number(p.port2),
          folder_path: p.folder_path.trim() || null,
        })),
      });
      setTcpConfigured(true);
    } catch (e) {
      setSaveErr(e.response?.data?.error || e.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-7 pt-7 pb-5 border-b border-slate-100 shrink-0">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
            <Network size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Connect to Camera System</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              One row = one pair. Port 1 ↔ Port 2 are matched within 30 ms.
            </p>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-7 py-5 space-y-3 min-h-0">

          {/* Column headers */}
          <div className="grid grid-cols-[1fr_90px_90px_160px_36px] gap-2 px-1 mb-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">IP Address</span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Port 1</span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Port 2</span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Folder <span className="normal-case font-normal text-slate-300">(optional)</span>
            </span>
            <span />
          </div>

          {/* Pair rows — 1 row per pair */}
          {pairs.map((p, idx) => (
            <div key={idx} className="space-y-0.5">
              {/* Pair label */}
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-1">
                Pair {idx + 1}
              </p>

              <div className={`grid grid-cols-[1fr_90px_90px_160px_36px] gap-2 items-center rounded-lg px-1 py-1
                ${errors[idx] ? "bg-red-50/60" : ""}`}>

                {/* IP */}
                <input
                  value={p.host}
                  onChange={e => update(idx, "host", e.target.value)}
                  placeholder="192.168.1.10"
                  className={`border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500
                    ${errors[idx] ? "border-red-300" : "border-slate-200"}`}
                />

                {/* Port 1 */}
                <input
                  value={p.port1}
                  onChange={e => update(idx, "port1", e.target.value)}
                  placeholder="3000"
                  type="number" min="1" max="65535"
                  className={`border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500
                    ${errors[idx] ? "border-red-300" : "border-slate-200"}`}
                />

                {/* Port 2 */}
                <input
                  value={p.port2}
                  onChange={e => update(idx, "port2", e.target.value)}
                  placeholder="8000"
                  type="number" min="1" max="65535"
                  className={`border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500
                    ${errors[idx] ? "border-red-300" : "border-slate-200"}`}
                />

                {/* Folder */}
                <input
                  value={p.folder_path}
                  onChange={e => update(idx, "folder_path", e.target.value)}
                  placeholder="C:\Images"
                  className="border border-slate-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                />

                {/* Delete */}
                <button
                  onClick={() => removePair(idx)}
                  title="Remove pair"
                  className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-400 transition"
                >
                  <X size={15} />
                </button>
              </div>

              {errors[idx] && (
                <p className="text-xs text-red-500 pl-1">{errors[idx]}</p>
              )}
            </div>
          ))}

          {/* Add pair button */}
          <button
            onClick={addPair}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium px-1 py-1.5 rounded hover:bg-blue-50 transition mt-1"
          >
            <Plus size={13} /> Add Pair
          </button>

          {saveErr && <p className="text-xs text-red-600 font-medium px-1">{saveErr}</p>}
        </div>

        {/* ── Footer ── */}
        <div className="px-7 py-5 border-t border-slate-100 shrink-0 space-y-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Wifi size={15} />}
            {saving ? "Connecting..." : "Save & Go to Dashboard"}
          </button>
          <p className="text-xs text-slate-400 text-center">
            Blank rows are ignored. Each pair's ports are matched within 30 ms.
          </p>
        </div>

      </div>
    </div>
  );
}
