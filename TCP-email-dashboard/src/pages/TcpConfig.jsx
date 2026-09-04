import { useEffect, useReducer, useState, useCallback } from "react";
import {
  Plus, Pencil, Trash2, Wifi, WifiOff, Loader2, X, Save,
  RefreshCw, Network, Layers, Check, ChevronDown,
} from "lucide-react";
import {
  getTcpCameras, createTcpCamera, updateTcpCamera, deleteTcpCamera,
  getTcpClientConfig, updateTcpClientConfig,
  getTcpZones, createTcpZone, deleteTcpZone,
} from "../api";
import { socket } from "../api";

/* ─────────────────────────────────────────── helpers */
const EMPTY_CAM  = { camera_name: "", ip_address: "", port: "", is_active: 1 };
const IP_REGEX   = /^(\d{1,3}\.){3}\d{1,3}$/;
const emptyRow   = () => ({ host: "", port: "", folder_path_ok: "", folder_path_nr: "" });
const validPort  = v => { const n = Number(v); return v !== "" && Number.isInteger(n) && n >= 1 && n <= 65535; };

function statusBadge(status) {
  if (status === "connected")  return "text-green-700 bg-green-50 border-green-200";
  if (status === "error")      return "text-red-700 bg-red-50 border-red-200";
  if (status === "connecting") return "text-yellow-700 bg-yellow-50 border-yellow-200";
  return "text-slate-500 bg-slate-100 border-slate-200";
}

/* ═══════════════════════════════════════════════════════════════════════════
   MULTI-SELECT DROPDOWN
═══════════════════════════════════════════════════════════════════════════ */
function MultiSelect({ options, selected, onChange, placeholder = "Select IP:Port combinations" }) {
  const [open, setOpen] = useState(false);

  function toggle(val) {
    onChange(
      selected.includes(val)
        ? selected.filter(s => s !== val)
        : [...selected, val]
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
      >
        <span className={selected.length ? "text-slate-800" : "text-slate-400"}>
          {selected.length
            ? `${selected.length} selected: ${selected.slice(0, 2).join(", ")}${selected.length > 2 ? "…" : ""}`
            : placeholder}
        </span>
        <ChevronDown size={15} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {options.length === 0
            ? <p className="text-xs text-slate-400 px-3 py-3">No IP:Port entries saved yet. Save the TCP Config first.</p>
            : options.map(opt => (
                <div
                  key={opt}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(opt);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm select-none"
                >
                  <div className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${selected.includes(opt) ? "bg-blue-600 border-blue-600" : "border-slate-300 bg-white"}`}>
                    {selected.includes(opt) && <Check size={11} className="text-white" strokeWidth={3} />}
                  </div>
                  <span className="font-mono text-slate-700">{opt}</span>
                </div>
              ))
          }
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TCP CLIENT CONFIG CARD
   One row per IP:Port with OK folder and NR folder
═══════════════════════════════════════════════════════════════════════════ */
function TcpClientConfig({ onEntriesSaved }) {
  const [rows,    setRows]    = useState([emptyRow()]);
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg,     setMsg]     = useState(null);
  const [errors,  setErrors]  = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getTcpClientConfig();
      let loaded = [];
      if (d.entries && d.entries.length > 0) {
        loaded = d.entries.map(e => ({
          host:          e.host          || "",
          port:          e.port   != null ? String(e.port) : "",
          folder_path_ok: e.folder_path_ok || "",
          folder_path_nr: e.folder_path_nr || "",
          zone_id:       e.zone_id       || null,
        }));
      }
      const result = loaded.length > 0 ? loaded : [emptyRow()];
      setRows(result);
      if (onEntriesSaved) onEntriesSaved(result);
    } finally {
      setLoading(false);
    }
  }, [onEntriesSaved]);

  useEffect(() => { load(); }, [load]);

  function update(idx, field, value) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
    setErrors(prev => { const n = { ...prev }; delete n[idx]; return n; });
    setMsg(null);
  }

  function removeRow(idx) {
    setRows(prev => prev.length === 1 ? [emptyRow()] : prev.filter((_, i) => i !== idx));
    setErrors(prev => {
      const n = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki !== idx) n[ki > idx ? ki - 1 : ki] = v;
      });
      return n;
    });
  }

  async function save() {
    const errs  = {};
    const valid = [];

    rows.forEach((r, i) => {
      const hasAny = r.host.trim() || r.port.toString().trim();
      if (!hasAny) return;
      if (!r.host.trim())                { errs[i] = "IP address is required"; return; }
      if (!IP_REGEX.test(r.host.trim())) { errs[i] = "Invalid IP (e.g. 192.168.1.10)"; return; }
      if (!validPort(r.port))            { errs[i] = "Port must be 1–65535"; return; }
      valid.push(r);
    });

    if (Object.keys(errs).length) { setErrors(errs); return; }
    if (valid.length === 0) { setMsg({ type: "error", text: "Enter at least one IP:Port row." }); return; }

    setSaving(true); setMsg(null);
    try {
      await updateTcpClientConfig({
        configs: valid.map(r => ({
          host:          r.host.trim(),
          port:          Number(r.port),
          folder_path_ok: r.folder_path_ok.trim() || null,
          folder_path_nr: r.folder_path_nr.trim() || null,
          zone_id:       r.zone_id || null,
        })),
      });
      setMsg({ type: "success", text: `Saved ${valid.length} row${valid.length > 1 ? "s" : ""}. TCP reconnected.` });
      load();
    } catch (e) {
      setMsg({ type: "error", text: e.response?.data?.error || e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <Network size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Camera TCP Connections</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              One row = one IP:Port. Assign OK &amp; NR image folders per IP.
            </p>
          </div>
        </div>
        <button onClick={load} title="Reload"
          className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition">
          <RefreshCw size={14} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={22} className="animate-spin text-slate-300" />
        </div>
      ) : (
        <div className="p-5 space-y-4">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_90px_1fr_1fr_36px] gap-2 px-1">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">IP Address</span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Port</span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Image Folder — <span className="text-green-600 font-bold">OK</span>
            </span>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Image Folder — <span className="text-red-500 font-bold">NR</span>
            </span>
            <span />
          </div>

          {/* Rows */}
          <div className="space-y-2">
            {rows.map((r, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className={`grid grid-cols-[1fr_90px_1fr_1fr_36px] gap-2 items-center rounded-lg px-1 py-1
                  ${errors[idx] ? "bg-red-50/60" : ""}`}>

                  <input
                    value={r.host}
                    onChange={e => update(idx, "host", e.target.value)}
                    placeholder="192.168.1.10"
                    className={`border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500
                      ${errors[idx] ? "border-red-300" : "border-slate-200"}`}
                  />
                  <input
                    value={r.port}
                    onChange={e => update(idx, "port", e.target.value)}
                    placeholder="3000"
                    type="number" min="1" max="65535"
                    className={`border rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500
                      ${errors[idx] ? "border-red-300" : "border-slate-200"}`}
                  />
                  <input
                    value={r.folder_path_ok}
                    onChange={e => update(idx, "folder_path_ok", e.target.value)}
                    placeholder="C:\Images\OK"
                    className="border border-green-200 bg-green-50/40 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-400"
                  />
                  <input
                    value={r.folder_path_nr}
                    onChange={e => update(idx, "folder_path_nr", e.target.value)}
                    placeholder="C:\Images\NR"
                    className="border border-red-200 bg-red-50/40 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                  <button onClick={() => removeRow(idx)} title="Remove row"
                    className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-400 transition">
                    <X size={15} />
                  </button>
                </div>

                {errors[idx] && (
                  <p className="text-xs text-red-500 pl-1">{errors[idx]}</p>
                )}
              </div>
            ))}
          </div>

          {/* Add row */}
          <button
            onClick={() => setRows(prev => [...prev, emptyRow()])}
            className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium px-1 py-1.5 rounded hover:bg-blue-50 transition">
            <Plus size={13} /> Add Row
          </button>

          {msg && (
            <p className={`text-xs font-medium px-1 ${msg.type === "success" ? "text-green-600" : "text-red-500"}`}>
              {msg.text}
            </p>
          )}

          {/* Save */}
          <div className="flex items-center gap-3 pt-1 border-t border-slate-100">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save &amp; Reconnect
            </button>
            <p className="text-xs text-slate-400">Blank rows are ignored.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZONE CARD
═══════════════════════════════════════════════════════════════════════════ */
function ZoneCard({ zone, onDelete }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm hover:shadow-md transition">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Layers size={14} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-800">{zone.name}</span>
        </div>
        <button
          onClick={() => onDelete(zone.id)}
          className="p-1.5 rounded hover:bg-red-50 text-slate-300 hover:text-red-400 transition"
          title="Delete zone">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="space-y-1">
        {zone.ports.length === 0
          ? <p className="text-xs text-slate-400 italic">No ports assigned</p>
          : zone.ports.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                <span className="text-xs font-mono text-slate-600">{p.host}:{p.port}</span>
              </div>
            ))
        }
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ADD ZONE MODAL
═══════════════════════════════════════════════════════════════════════════ */
function AddZoneModal({ savedEntries, onClose, onCreated }) {
  const [selected, setSelected] = useState([]);
  const [zoneName, setZoneName] = useState("");
  const [saving,   setSaving]   = useState(false);
  const [err,      setErr]      = useState("");

  const options = savedEntries
    .filter(e => e.host && e.port)
    .map(e => `${e.host}:${e.port}`);

  async function submit() {
    if (selected.length === 0) { setErr("Select at least one IP:Port."); return; }
    setSaving(true); setErr("");
    try {
      const ports = selected.map(s => {
        const [host, port] = s.split(":");
        return { host, port: Number(port) };
      });
      const result = await createTcpZone({ name: zoneName.trim() || undefined, ports });
      onCreated(result.zone);
      onClose();
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <Layers size={18} className="text-indigo-600" /> Add Zone
          </h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100 text-slate-400">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Zone Name <span className="text-slate-400">(optional — auto-named if blank)</span></label>
            <input
              value={zoneName}
              onChange={e => setZoneName(e.target.value)}
              placeholder="e.g. Production Line A"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Select IP:Port combinations for this Zone
            </label>
            <MultiSelect
              options={options}
              selected={selected}
              onChange={setSelected}
            />
          </div>

          {selected.length > 0 && (
            <div className="bg-indigo-50 rounded-lg p-3 space-y-1">
              <p className="text-xs font-semibold text-indigo-700">Selected:</p>
              {selected.map(s => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                  <span className="text-xs font-mono text-indigo-800">{s}</span>
                </div>
              ))}
            </div>
          )}

          {err && <p className="text-xs text-red-500">{err}</p>}
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ZONES SECTION
═══════════════════════════════════════════════════════════════════════════ */
function ZonesSection({ savedEntries }) {
  const [zones,        setZones]       = useState([]);
  const [loadingZones, setLoadingZones] = useState(true);
  const [showModal,    setShowModal]   = useState(false);

  const loadZones = useCallback(async () => {
    setLoadingZones(true);
    try { const data = await getTcpZones(); setZones(data); }
    finally { setLoadingZones(false); }
  }, []);

  useEffect(() => { loadZones(); }, [loadZones]);

  async function handleDelete(id) {
    if (!window.confirm("Delete this zone?")) return;
    try { await deleteTcpZone(id); loadZones(); }
    catch (e) { alert(e.response?.data?.error || e.message); }
  }

  function handleCreated(zone) {
    setZones(prev => [...prev, zone]);
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Zones</h2>
          <p className="text-xs text-slate-500">Group IP:Port combinations into a Zone for message processing &amp; email.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition">
          <Plus size={14} /> Add Zone
        </button>
      </div>

      {/* Zone cards */}
      {loadingZones ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-slate-300" size={24} />
        </div>
      ) : zones.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
          No zones created yet. Click <strong>Add Zone</strong> to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {zones.map(z => (
            <ZoneCard key={z.id} zone={z} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {showModal && (
        <AddZoneModal
          savedEntries={savedEntries}
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════════ */
export default function TcpConfig() {
  const [cameras,   setCameras]   = useState([]);
  const [statuses,  setStatuses]  = useState({});
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState(null);
  const [form,      setForm]      = useReducer((s, p) => ({ ...s, ...p }), EMPTY_CAM);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState("");
  // savedEntries is kept up-to-date from TcpClientConfig so the Zone modal has fresh IP:Port list
  const [savedEntries, setSavedEntries] = useState([]);

  async function load() {
    setLoading(true);
    try { const rows = await getTcpCameras(); setCameras(rows); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    socket.on("init_statuses", list => {
      setStatuses(Object.fromEntries(list.map(s => [s.key, s])));
    });
    socket.on("server_status",  s => setStatuses(prev => ({ ...prev, [s.key]: s })));
    socket.on("server_stopped", ({ ip_address, port }) =>
      setStatuses(prev => { const n = { ...prev }; delete n[`${ip_address}:${port}`]; return n; })
    );
    return () => {
      socket.off("init_statuses");
      socket.off("server_status");
      socket.off("server_stopped");
    };
  }, []);

  function openAdd()   { setForm(EMPTY_CAM); setError(""); setModal({ mode: "add" }); }
  function openEdit(c) {
    setForm({ camera_name: c.camera_name, ip_address: c.ip_address, port: c.port, is_active: c.is_active });
    setError(""); setModal({ mode: "edit", id: c.id });
  }

  async function handleSave() {
    if (!form.camera_name || !form.ip_address || !form.port) { setError("All fields are required."); return; }
    setSaving(true); setError("");
    try {
      modal.mode === "add" ? await createTcpCamera(form) : await updateTcpCamera(modal.id, form);
      setModal(null); load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally { setSaving(false); }
  }

  async function handleDelete(cam) {
    if (!window.confirm(`Delete "${cam.camera_name}"?`)) return;
    await deleteTcpCamera(cam.id); load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">TCP Config</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage camera TCP connections, image folders, and processing zones</p>
      </div>

      {/* TCP Client Config — new single-port + OK/NR folder table */}
      <TcpClientConfig onEntriesSaved={setSavedEntries} />

      {/* Zone section */}
      <ZonesSection savedEntries={savedEntries} />

      {/* TCP Server Listeners */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">TCP Server Listeners</h2>
            <p className="text-xs text-slate-500">Ports this system listens on for incoming connections</p>
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus size={15} /> Add Listener
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-slate-400" size={28} />
          </div>
        ) : cameras.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">No listeners configured yet.</div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {["Name", "IP Address", "Port", "Status", "Last Message", "Active", ""].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cameras.map(cam => {
                  const k  = `${cam.ip_address}:${cam.port}`;
                  const st = statuses[k];
                  return (
                    <tr key={cam.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{cam.camera_name}</td>
                      <td className="px-4 py-3 text-slate-600 font-mono">{cam.ip_address}</td>
                      <td className="px-4 py-3 text-slate-600 font-mono">{cam.port}</td>
                      <td className="px-4 py-3">
                        {st ? (
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadge(st.status)}`}>
                            {st.status === "connected" ? <Wifi size={11} /> : <WifiOff size={11} />}
                            {st.status}{st.clients > 0 && ` (${st.clients})`}
                          </span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-xs truncate">{st?.lastMessage || "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${cam.is_active ? "text-green-600" : "text-slate-400"}`}>
                          {cam.is_active ? "Yes" : "No"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => openEdit(cam)}
                            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => handleDelete(cam)}
                            className="p-1.5 rounded hover:bg-red-50 text-slate-500 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Listener modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-800">
              {modal.mode === "add" ? "Add TCP Listener" : "Edit TCP Listener"}
            </h2>
            {[
              { label: "Name",       key: "camera_name", placeholder: "Camera A" },
              { label: "IP Address", key: "ip_address",  placeholder: "0.0.0.0" },
              { label: "Port",       key: "port",        placeholder: "9000", type: "number" },
            ].map(({ label, key, placeholder, type }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                <input type={type || "text"} value={form[key]}
                  onChange={e => setForm({ [key]: e.target.value })} placeholder={placeholder}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <input id="is_active" type="checkbox" checked={!!form.is_active}
                onChange={e => setForm({ is_active: e.target.checked ? 1 : 0 })}
                className="rounded border-slate-300" />
              <label htmlFor="is_active" className="text-sm text-slate-700">Active</label>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setModal(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">
                {saving && <Loader2 size={13} className="animate-spin" />}
                {modal.mode === "add" ? "Add" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
