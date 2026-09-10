/**
 * File Manager Controller
 * All operations are restricted to FILE_MANAGER_ROOT (the ToteTrack project root).
 * Path traversal and absolute-path escapes are rejected before any FS operation.
 */

const fs      = require("fs");
const path    = require("path");
const multer  = require("multer");

// ── Root directory — everything is jailed inside this ─────────────────────
const ROOT = path.resolve(__dirname, "../../../");  // d:\ToteTrack

/** Resolve a client-supplied relative path and verify it stays inside ROOT. */
function safeResolve(relPath = "") {
  // Strip leading slashes / backslashes so path.join doesn't escape root
  const cleaned = relPath.replace(/^[\\/]+/, "");
  const resolved = path.resolve(ROOT, cleaned);

  // Reject anything that escapes the root
  if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
    return null;
  }
  return resolved;
}

/** Convert an absolute FS path back to a root-relative POSIX string. */
function toRelative(absPath) {
  return absPath.slice(ROOT.length).replace(/\\/g, "/") || "/";
}

/** Format bytes to human-readable size. */
function fmtSize(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ── Multer — upload files into the target directory ────────────────────────
const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const dest = safeResolve(req.query.path || "");
    if (!dest) return cb(new Error("Invalid path"));
    if (!fs.existsSync(dest)) return cb(new Error("Directory does not exist"));
    cb(null, dest);
  },
  filename(_req, file, cb) {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB cap
exports.uploadMiddleware = upload.single("file");

// ─────────────────────────────────────────────────────────────────────────────
// LIST  GET /api/files?path=
// ─────────────────────────────────────────────────────────────────────────────
exports.list = (req, res) => {
  const abs = safeResolve(req.query.path || "");
  if (!abs) return res.status(400).json({ success: false, message: "Invalid path" });

  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, message: "Path not found" });

  const stat = fs.statSync(abs);
  if (!stat.isDirectory()) return res.status(400).json({ success: false, message: "Not a directory" });

  const IGNORE = new Set(["node_modules", ".git"]);

  const entries = fs.readdirSync(abs).map((name) => {
    const full = path.join(abs, name);
    try {
      const s = fs.statSync(full);
      return {
        name,
        type:     s.isDirectory() ? "folder" : "file",
        size:     s.isDirectory() ? null : fmtSize(s.size),
        sizeRaw:  s.isDirectory() ? null : s.size,
        modified: s.mtime.toISOString(),
        ext:      s.isDirectory() ? null : path.extname(name).slice(1).toLowerCase(),
      };
    } catch {
      return null;
    }
  })
  .filter(Boolean)
  .filter(e => !IGNORE.has(e.name));

  // Folders first, then files — each group sorted A-Z
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  res.json({
    success: true,
    path:    toRelative(abs),
    root:    ROOT,
    entries,
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// READ  GET /api/files/read?path=
// ─────────────────────────────────────────────────────────────────────────────
const TEXT_EXTS = new Set([
  "js","jsx","ts","tsx","json","md","txt","env","example","yml","yaml",
  "html","css","sql","log","sh","bat","gitignore","csv","xml","ini","cfg",
]);

exports.read = (req, res) => {
  const abs = safeResolve(req.query.path || "");
  if (!abs) return res.status(400).json({ success: false, message: "Invalid path" });
  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, message: "File not found" });

  const stat = fs.statSync(abs);
  if (!stat.isDirectory()) {
    const ext = path.extname(abs).slice(1).toLowerCase();
    if (!TEXT_EXTS.has(ext)) {
      return res.status(415).json({ success: false, message: "File type not editable" });
    }
    if (stat.size > 2 * 1024 * 1024) {
      return res.status(413).json({ success: false, message: "File too large to edit (>2 MB)" });
    }
    const content = fs.readFileSync(abs, "utf8");
    return res.json({ success: true, content, path: toRelative(abs) });
  }
  res.status(400).json({ success: false, message: "Not a file" });
};

// ─────────────────────────────────────────────────────────────────────────────
// SAVE  PUT /api/files/save   body: { path, content }
// ─────────────────────────────────────────────────────────────────────────────
exports.save = (req, res) => {
  const abs = safeResolve(req.body.path || "");
  if (!abs) return res.status(400).json({ success: false, message: "Invalid path" });

  const ext = path.extname(abs).slice(1).toLowerCase();
  if (!TEXT_EXTS.has(ext)) {
    return res.status(415).json({ success: false, message: "File type not editable" });
  }

  try {
    fs.writeFileSync(abs, req.body.content ?? "", "utf8");
    res.json({ success: true, path: toRelative(abs) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE FILE  POST /api/files/create-file  body: { path, name }
// ─────────────────────────────────────────────────────────────────────────────
exports.createFile = (req, res) => {
  const dir = safeResolve(req.body.path || "");
  if (!dir) return res.status(400).json({ success: false, message: "Invalid path" });

  const name = (req.body.name || "").replace(/[/\\]/g, "");
  if (!name) return res.status(400).json({ success: false, message: "File name required" });

  const abs = path.join(dir, name);
  if (!abs.startsWith(ROOT)) return res.status(400).json({ success: false, message: "Invalid path" });
  if (fs.existsSync(abs)) return res.status(409).json({ success: false, message: "File already exists" });

  try {
    fs.writeFileSync(abs, "", "utf8");
    res.json({ success: true, path: toRelative(abs) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE FOLDER  POST /api/files/create-folder  body: { path, name }
// ─────────────────────────────────────────────────────────────────────────────
exports.createFolder = (req, res) => {
  const dir = safeResolve(req.body.path || "");
  if (!dir) return res.status(400).json({ success: false, message: "Invalid path" });

  const name = (req.body.name || "").replace(/[/\\]/g, "");
  if (!name) return res.status(400).json({ success: false, message: "Folder name required" });

  const abs = path.join(dir, name);
  if (!abs.startsWith(ROOT)) return res.status(400).json({ success: false, message: "Invalid path" });
  if (fs.existsSync(abs)) return res.status(409).json({ success: false, message: "Folder already exists" });

  try {
    fs.mkdirSync(abs, { recursive: true });
    res.json({ success: true, path: toRelative(abs) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// RENAME  PUT /api/files/rename  body: { path, newName }
// ─────────────────────────────────────────────────────────────────────────────
exports.rename = (req, res) => {
  const abs = safeResolve(req.body.path || "");
  if (!abs) return res.status(400).json({ success: false, message: "Invalid path" });
  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, message: "Not found" });

  const newName = (req.body.newName || "").replace(/[/\\]/g, "");
  if (!newName) return res.status(400).json({ success: false, message: "New name required" });

  const dest = path.join(path.dirname(abs), newName);
  if (!dest.startsWith(ROOT)) return res.status(400).json({ success: false, message: "Invalid destination" });
  if (fs.existsSync(dest)) return res.status(409).json({ success: false, message: "Name already in use" });

  try {
    fs.renameSync(abs, dest);
    res.json({ success: true, path: toRelative(dest) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE  DELETE /api/files/delete  body: { path }
// ─────────────────────────────────────────────────────────────────────────────
exports.remove = (req, res) => {
  const abs = safeResolve(req.body.path || "");
  if (!abs) return res.status(400).json({ success: false, message: "Invalid path" });
  if (abs === ROOT) return res.status(400).json({ success: false, message: "Cannot delete root" });
  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, message: "Not found" });

  try {
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) {
      fs.rmSync(abs, { recursive: true, force: true });
    } else {
      fs.unlinkSync(abs);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DOWNLOAD  GET /api/files/download?path=
// ─────────────────────────────────────────────────────────────────────────────
exports.download = (req, res) => {
  const abs = safeResolve(req.query.path || "");
  if (!abs) return res.status(400).json({ success: false, message: "Invalid path" });
  if (!fs.existsSync(abs)) return res.status(404).json({ success: false, message: "File not found" });
  if (fs.statSync(abs).isDirectory()) return res.status(400).json({ success: false, message: "Cannot download a folder" });

  res.download(abs, path.basename(abs));
};

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD  POST /api/files/upload?path=   (handled by multer middleware)
// ─────────────────────────────────────────────────────────────────────────────
exports.upload = (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No file received" });
  res.json({ success: true, name: req.file.filename, path: toRelative(req.file.path) });
};
