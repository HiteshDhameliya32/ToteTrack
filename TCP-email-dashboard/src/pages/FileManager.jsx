import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fmList, fmRead, fmSave, fmCreateFile, fmCreateFolder,
  fmRename, fmDelete, fmDownload, fmUpload,
} from "../api";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import { useToastStore } from "../store/toast.store";
import {
  Folder, FileText, Download, Trash2, Edit2, RefreshCw,
  FolderPlus, FilePlus, Upload, Save, X, ChevronRight,
  Home, RotateCcw, Check,
} from "lucide-react";

/* ─── helpers ──────────────────────────────────────────── */
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short",
    year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

const TEXT_EXTS = new Set([
  "js","jsx","ts","tsx","json","md","txt","env","example","yml","yaml",
  "html","css","sql","log","sh","bat","gitignore","csv","xml","ini","cfg",
]);

function isEditable(ext) { return TEXT_EXTS.has((ext || "").toLowerCase()); }

const EXT_ICON_COLOR = {
  js: "text-yellow-500", jsx: "text-cyan-500", ts: "text-blue-500",
  tsx: "text-blue-400", json: "text-green-500", md: "text-slate-500",
  sql: "text-orange-500", log: "text-slate-400", txt: "text-slate-400",
  html: "text-orange-600", css: "text-blue-600", default: "text-slate-400",
};
function fileColor(ext) { return EXT_ICON_COLOR[ext] || EXT_ICON_COLOR.default; }

/* ─── Inline rename input ──────────────────────────────── */
function RenameInput({ value, onSave, onCancel }) {
  const [val, setVal] = useState(value);
  return (
    <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onSave(val); if (e.key === "Escape") onCancel(); }}
        className="border border-blue-300 rounded px-1.5 py-0.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-400 w-40"
      />
      <button onClick={() => onSave(val)} className="text-emerald-600 hover:text-emerald-700"><Check size={13} /></button>
      <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={13} /></button>
    </span>
  );
}

/* ─── Confirm modal ────────────────────────────────────── */
function ConfirmModal({ open, message, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <p className="text-sm text-slate-700 mb-5">{message}</p>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>Delete</Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Editor modal ─────────────────────────────────────── */
function EditorModal({ file, initialContent, onSave, onClose, saving }) {
  const [content, setContent] = useState(initialContent);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl h-[80vh] rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
          <span className="text-sm font-semibold text-slate-700 font-mono">{file}</span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="success" onClick={() => onSave(content)} disabled={saving}>
              {saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
              {saving ? "Saving…" : "Save"}
            </Button>
            <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-md transition-colors">
              <X size={14} className="text-slate-500" />
            </button>
          </div>
        </div>
        {/* Editor */}
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          spellCheck={false}
          className="flex-1 w-full p-4 font-mono text-xs text-slate-800 bg-white resize-none focus:outline-none leading-relaxed"
        />
      </div>
    </div>
  );
}

/* ─── New name modal (file or folder) ─────────────────── */
function NewNameModal({ title, placeholder, onConfirm, onClose }) {
  const [name, setName] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 className="text-sm font-semibold text-slate-800 mb-4">{title}</h3>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && name.trim()) onConfirm(name.trim()); if (e.key === "Escape") onClose(); }}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 mb-4"
        />
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => name.trim() && onConfirm(name.trim())} disabled={!name.trim()}>
            Create
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Breadcrumb ───────────────────────────────────────── */
function Breadcrumb({ currentPath, onNavigate }) {
  const parts = currentPath.replace(/^\//, "").split("/").filter(Boolean);
  return (
    <nav className="flex items-center gap-1 text-xs text-slate-500 flex-wrap">
      <button
        onClick={() => onNavigate("")}
        className="flex items-center gap-1 hover:text-blue-600 font-medium transition-colors"
      >
        <Home size={12} /> Root
      </button>
      {parts.map((part, i) => {
        const pathTo = parts.slice(0, i + 1).join("/");
        const isLast = i === parts.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={11} className="text-slate-300" />
            {isLast ? (
              <span className="font-semibold text-slate-700">{part}</span>
            ) : (
              <button
                onClick={() => onNavigate(pathTo)}
                className="hover:text-blue-600 font-medium transition-colors"
              >
                {part}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/* ─── Main page ────────────────────────────────────────── */
export default function FileManager() {
  const qc    = useQueryClient();
  const toast = useToastStore(s => s.addToast);

  const [currentPath,  setCurrentPath]  = useState("");
  const [renaming,     setRenaming]     = useState(null);   // entry name being renamed
  const [editor,       setEditor]       = useState(null);   // { path, name, content }
  const [confirmDel,   setConfirmDel]   = useState(null);   // entry to delete
  const [newFileModal, setNewFileModal] = useState(false);
  const [newFolderModal, setNewFolderModal] = useState(false);

  const uploadRef = useRef(null);

  // ── List query ────────────────────────────────────────
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["fm-list", currentPath],
    queryFn:  () => fmList(currentPath),
    staleTime: 0,
  });

  const entries = data?.entries ?? [];

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["fm-list", currentPath] });
  }, [qc, currentPath]);

  // ── Navigate ──────────────────────────────────────────
  const navigate = (relPath) => {
    setRenaming(null);
    setCurrentPath(relPath);
  };

  const goUp = () => {
    const parts = currentPath.replace(/^\//, "").split("/").filter(Boolean);
    parts.pop();
    navigate(parts.join("/"));
  };

  // ── Edit file ─────────────────────────────────────────
  const openEditor = async (entry) => {
    try {
      const filePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      const res = await fmRead(filePath);
      setEditor({ path: filePath, name: entry.name, content: res.content });
    } catch (err) {
      toast(err.response?.data?.message || "Cannot open file", "error");
    }
  };

  // ── Save mutation ─────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: ({ path, content }) => fmSave(path, content),
    onSuccess: () => { toast("✅ File saved"); invalidate(); },
    onError:   (e) => toast(e.response?.data?.message || "Save failed", "error"),
  });

  // ── Create file ───────────────────────────────────────
  const createFileMut = useMutation({
    mutationFn: (name) => fmCreateFile(currentPath, name),
    onSuccess:  () => { toast("✅ File created"); invalidate(); setNewFileModal(false); },
    onError:    (e) => toast(e.response?.data?.message || "Failed", "error"),
  });

  // ── Create folder ─────────────────────────────────────
  const createFolderMut = useMutation({
    mutationFn: (name) => fmCreateFolder(currentPath, name),
    onSuccess:  () => { toast("✅ Folder created"); invalidate(); setNewFolderModal(false); },
    onError:    (e) => toast(e.response?.data?.message || "Failed", "error"),
  });

  // ── Rename mutation ───────────────────────────────────
  const renameMut = useMutation({
    mutationFn: ({ entryName, newName }) => {
      const entryPath = currentPath ? `${currentPath}/${entryName}` : entryName;
      return fmRename(entryPath, newName);
    },
    onSuccess: () => { toast("✅ Renamed"); invalidate(); setRenaming(null); },
    onError:   (e) => toast(e.response?.data?.message || "Rename failed", "error"),
  });

  // ── Delete mutation ───────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: (entryName) => {
      const entryPath = currentPath ? `${currentPath}/${entryName}` : entryName;
      return fmDelete(entryPath);
    },
    onSuccess: () => { toast("🗑️ Deleted"); invalidate(); setConfirmDel(null); },
    onError:   (e) => toast(e.response?.data?.message || "Delete failed", "error"),
  });

  // ── Upload ────────────────────────────────────────────
  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await fmUpload(currentPath, file);
      toast(`✅ Uploaded ${file.name}`);
      invalidate();
    } catch (err) {
      toast(err.response?.data?.message || "Upload failed", "error");
    } finally {
      e.target.value = "";
    }
  };

  // ── Download ──────────────────────────────────────────
  const handleDownload = (entry) => {
    const filePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
    fmDownload(filePath);
  };

  const depthParts = currentPath ? currentPath.split("/").filter(Boolean) : [];

  return (
    <div className="space-y-4">
      {/* ── Page header ─────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800">File Manager</h1>
          <p className="text-xs text-slate-500 mt-0.5">Browse and manage the application directory</p>
        </div>
      </div>

      {/* ── Toolbar ─────────────────────────────────────── */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          {depthParts.length > 0 && (
            <Button size="sm" variant="ghost" onClick={goUp}>
              <RotateCcw size={13} /> Up
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} /> Refresh
          </Button>
          <div className="h-4 w-px bg-slate-200" />
          <Button size="sm" variant="ghost" onClick={() => setNewFolderModal(true)}>
            <FolderPlus size={13} /> New Folder
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setNewFileModal(true)}>
            <FilePlus size={13} /> New File
          </Button>
          <Button size="sm" variant="primary" onClick={() => uploadRef.current?.click()}>
            <Upload size={13} /> Upload
          </Button>
          <input ref={uploadRef} type="file" className="hidden" onChange={handleUpload} />

          {/* Breadcrumb */}
          <div className="ml-auto">
            <Breadcrumb currentPath={data?.path || "/"} onNavigate={navigate} />
          </div>
        </div>
      </Card>

      {/* ── File table ──────────────────────────────────── */}
      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-slate-400 text-sm">
            <RefreshCw size={16} className="animate-spin" /> Loading…
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-red-500">Failed to load directory.</div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">Empty directory.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold w-20">Type</th>
                  <th className="px-4 py-3 font-semibold w-24">Size</th>
                  <th className="px-4 py-3 font-semibold w-44">Modified</th>
                  <th className="px-4 py-3 font-semibold w-64 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {entries.map((entry) => {
                  const isFolder  = entry.type === "folder";
                  const editable  = !isFolder && isEditable(entry.ext);
                  const isRenaming = renaming === entry.name;

                  return (
                    <tr
                      key={entry.name}
                      className="hover:bg-slate-50 transition-colors group"
                    >
                      {/* Name */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          {isFolder ? (
                            <Folder size={16} className="text-amber-400 shrink-0" />
                          ) : (
                            <FileText size={16} className={`${fileColor(entry.ext)} shrink-0`} />
                          )}
                          {isRenaming ? (
                            <RenameInput
                              value={entry.name}
                              onSave={(newName) => renameMut.mutate({ entryName: entry.name, newName })}
                              onCancel={() => setRenaming(null)}
                            />
                          ) : (
                            <button
                              className={`text-slate-700 font-medium text-sm text-left ${isFolder ? "hover:text-blue-600 cursor-pointer" : "cursor-default"}`}
                              onClick={() => {
                                if (isFolder) navigate(currentPath ? `${currentPath}/${entry.name}` : entry.name);
                              }}
                            >
                              {entry.name}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Type */}
                      <td className="px-4 py-2.5 text-xs text-slate-400">
                        {isFolder ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">Folder</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                            {entry.ext || "FILE"}
                          </span>
                        )}
                      </td>

                      {/* Size */}
                      <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">
                        {entry.size || "—"}
                      </td>

                      {/* Modified */}
                      <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                        {fmtDate(entry.modified)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {editable && (
                            <button
                              onClick={() => openEditor(entry)}
                              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                              title="Edit"
                            >
                              <Edit2 size={12} /> Edit
                            </button>
                          )}
                          {!isFolder && (
                            <button
                              onClick={() => handleDownload(entry)}
                              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-emerald-600 hover:bg-emerald-50 transition-colors"
                              title="Download"
                            >
                              <Download size={12} /> Download
                            </button>
                          )}
                          <button
                            onClick={() => setRenaming(entry.name)}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-amber-600 hover:bg-amber-50 transition-colors"
                            title="Rename"
                          >
                            <Edit2 size={12} /> Rename
                          </button>
                          <button
                            onClick={() => setConfirmDel(entry)}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Footer */}
            <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2.5 text-xs text-slate-400">
              {entries.filter(e => e.type === "folder").length} folder(s) &nbsp;·&nbsp;
              {entries.filter(e => e.type === "file").length} file(s)
            </div>
          </div>
        )}
      </Card>

      {/* ── Modals ──────────────────────────────────────── */}
      {newFileModal && (
        <NewNameModal
          title="Create New File"
          placeholder="e.g. notes.txt"
          onConfirm={(name) => createFileMut.mutate(name)}
          onClose={() => setNewFileModal(false)}
        />
      )}

      {newFolderModal && (
        <NewNameModal
          title="Create New Folder"
          placeholder="e.g. uploads"
          onConfirm={(name) => createFolderMut.mutate(name)}
          onClose={() => setNewFolderModal(false)}
        />
      )}

      {confirmDel && (
        <ConfirmModal
          open
          message={`Permanently delete "${confirmDel.name}"? This cannot be undone.`}
          onConfirm={() => deleteMut.mutate(confirmDel.name)}
          onCancel={() => setConfirmDel(null)}
        />
      )}

      {editor && (
        <EditorModal
          file={editor.name}
          initialContent={editor.content}
          saving={saveMut.isPending}
          onSave={(content) => saveMut.mutate({ path: editor.path, content })}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
