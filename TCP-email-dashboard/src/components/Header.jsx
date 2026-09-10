import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, RefreshCw, X, CheckCheck, ChevronRight, AlertCircle, AlertTriangle, Info, Zap, LogOut, Shield, Building, User } from "lucide-react";
import { socket, getNotifications, getUnreadCount, markNotifRead, markAllNotifsRead } from "../api/index";
import { useAuth } from "../store/AuthContext";

const PAGE_TITLES = {
  "/":              { title: "Dashboard",          sub: "Smart Tote Barcode Scanning & Analytics" },
  "/records":       { title: "Live Data", sub: "Tote processing cycles with PASS/NR status" },
  "/schedules":     { title: "Email Schedules",    sub: "Configure automatic email send times" },
  "/recipients":    { title: "Email Recipients",   sub: "Manage who receives the email reports" },
  "/email-history": { title: "Email History",      sub: "Log of all sent email reports" },
  "/pending":       { title: "Pending Messages",   sub: "Records awaiting email delivery" },
  "/settings":      { title: "Settings",           sub: "Configure SMTP settings for email delivery" },
  "/notifications": { title: "Notifications",      sub: "System alerts and service error logs" },
  "/users":         { title: "Users Management",   sub: "Configure access roles and permissions" },
  "/file-manager":  { title: "File Manager",        sub: "Browse and manage the application directory" },
};

const SEVERITY_STYLES = {
  error:    { bg: "bg-red-50",    border: "border-red-200",    badge: "bg-red-100 text-red-700 border-red-200",      icon: AlertCircle,   dot: "bg-red-500"    },
  warning:  { bg: "bg-orange-50", border: "border-orange-200", badge: "bg-orange-100 text-orange-700 border-orange-200", icon: AlertTriangle, dot: "bg-orange-500" },
  critical: { bg: "bg-rose-50",   border: "border-rose-200",   badge: "bg-rose-100 text-rose-800 border-rose-200",    icon: Zap,           dot: "bg-rose-700"   },
  info:     { bg: "bg-blue-50",   border: "border-blue-200",   badge: "bg-blue-100 text-blue-700 border-blue-200",    icon: Info,          dot: "bg-blue-500"   },
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: "Asia/Kolkata"
  });
}

export default function Header() {
  const { pathname } = useLocation();
  const navigate     = useNavigate();
  const page         = PAGE_TITLES[pathname] ?? { title: "ToteTrack", sub: "" };
  const { user, logout } = useAuth();

  const [open,          setOpen]          = useState(false);
  const [profileOpen,   setProfileOpen]   = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unread,        setUnread]        = useState(0);
  const [loading,       setLoading]       = useState(false);

  const dropdownRef = useRef(null);
  const profileRef  = useRef(null);

  // ── fetch helpers ──────────────────────────────────────────
  const fetchCount = useCallback(async () => {
    try { setUnread(await getUnreadCount()); } catch (_) {}
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotifications();
      setNotifications(data);
      setUnread(data.filter(n => !n.is_read).length);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  // ── initial load + polling (15s fallback) ──────────────────
  useEffect(() => {
    fetchCount();
    const t = setInterval(fetchCount, 15000);
    return () => clearInterval(t);
  }, [fetchCount]);

  // ── socket.io real-time ────────────────────────────────────
  useEffect(() => {
    socket.on("notification:new", (n) => {
      // Scoping check on real-time notification
      if (user && user.role !== "Super Admin" && n.company_id !== user.company_id) {
        return;
      }
      setNotifications(prev => [n, ...prev].slice(0, 100));
      setUnread(c => c + 1);
    });
    return () => socket.off("notification:new");
  }, [user]);

  // ── open dropdown → load full list ────────────────────────
  useEffect(() => {
    if (open) fetchAll();
  }, [open, fetchAll]);

  // ── outside click close ────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── actions ────────────────────────────────────────────────
  const handleMarkRead = async (id, e) => {
    e.stopPropagation();
    await markNotifRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
    setUnread(c => Math.max(0, c - 1));
  };

  const handleMarkAll = async () => {
    await markAllNotifsRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    setUnread(0);
  };

  const handleViewAll = () => { setOpen(false); navigate("/notifications"); };

  const handleLogout = () => {
    setProfileOpen(false);
    logout();
    navigate("/login");
  };

  const userInitial = user?.name ? user.name.substring(0, 2).toUpperCase() : "U";

  return (
    <header className="fixed top-0 left-56 right-0 z-20 h-16 bg-white border-b border-slate-200 shadow-sm flex items-center px-6 lg:px-8">
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-slate-800 leading-tight truncate">{page.title}</h1>
        {page.sub && <p className="text-xs text-slate-400 leading-tight truncate hidden sm:block">{page.sub}</p>}
      </div>

      <div className="flex items-center gap-3 ml-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5 hidden sm:flex">
          <RefreshCw size={11} />
          <span>Auto-refresh 30s</span>
        </div>

        {/* Bell */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen(o => !o)}
            className="relative h-8 w-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <Bell size={14} />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none shadow-sm">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>

          {/* Dropdown */}
          {open && (
            <div className="absolute right-0 top-10 w-96 bg-white rounded-xl border border-slate-200 shadow-2xl shadow-slate-200/60 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2">
                  <Bell size={14} className="text-slate-600" />
                  <span className="text-sm font-semibold text-slate-700">Notifications</span>
                  {unread > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unread}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {unread > 0 && (
                    <button onClick={handleMarkAll} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 hover:bg-blue-50 rounded-md transition-colors">
                      <CheckCheck size={12} /> Mark all read
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} className="p-1 hover:bg-slate-200 rounded-md transition-colors">
                    <X size={13} className="text-slate-500" />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="overflow-y-auto max-h-[400px] divide-y divide-slate-100">
                {loading ? (
                  <div className="flex items-center justify-center py-10 text-slate-400 text-sm gap-2">
                    <RefreshCw size={14} className="animate-spin" /> Loading…
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                    <Bell size={28} className="opacity-30" />
                    <span className="text-sm">No notifications</span>
                  </div>
                ) : (
                  notifications.map(n => {
                    const s = SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.info;
                    const Icon = s.icon;
                    return (
                      <div
                        key={n.id}
                        className={`flex gap-3 px-4 py-3 transition-colors cursor-default ${n.is_read ? "bg-white" : s.bg}`}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center ${s.bg} border ${s.border}`}>
                            <Icon size={13} className={n.severity === "error" ? "text-red-600" : n.severity === "warning" ? "text-orange-600" : n.severity === "critical" ? "text-rose-700" : "text-blue-600"} />
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-xs font-semibold text-slate-700">{n.service_name}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border capitalize ${s.badge}`}>
                              {n.severity}
                            </span>
                            {!n.is_read && <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ml-auto flex-shrink-0`} />}
                          </div>
                          <p className="text-xs text-slate-600 leading-snug truncate">{n.title || n.message}</p>
                          <p className="text-[10px] text-slate-400 mt-1">{timeAgo(n.created_at)} · {formatDate(n.created_at)}</p>
                        </div>
                        {!n.is_read && (
                          <button onClick={(e) => handleMarkRead(n.id, e)} className="flex-shrink-0 p-1 hover:bg-white/80 rounded transition-colors self-start mt-0.5" title="Mark as read">
                            <CheckCheck size={12} className="text-slate-400 hover:text-blue-500" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50">
                <button onClick={handleViewAll} className="w-full flex items-center justify-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium py-1 hover:bg-blue-50 rounded-md transition-colors">
                  View all notifications <ChevronRight size={12} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Profile Drodown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(p => !p)}
            className="h-8 w-8 rounded-full bg-indigo-600 hover:bg-indigo-700 cursor-pointer flex items-center justify-center text-white text-xs font-bold shadow-sm shadow-indigo-600/10 border border-indigo-500 transition-colors"
          >
            {userInitial}
          </button>

          {profileOpen && user && (
            <div className="absolute right-0 top-10 w-64 bg-white border border-slate-200 shadow-2xl rounded-xl overflow-hidden z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Signed in as</p>
                <p className="text-sm font-bold text-slate-900 truncate mt-1">{user.name}</p>
                <p className="text-xs text-slate-400 truncate mt-0.5">{user.email}</p>
              </div>

              <div className="px-4 py-2 border-b border-slate-100 text-xs text-slate-500 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-700">{user.role}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-700">{user.company_name}</span>
                </div>
              </div>

              <div className="px-1 pt-1.5">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-lg cursor-pointer transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
