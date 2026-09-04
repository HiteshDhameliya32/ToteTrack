import { useState, useEffect, useCallback } from "react";
import { Bell, RefreshCw, CheckCheck, AlertCircle, AlertTriangle, Info, Zap, Filter } from "lucide-react";
import { getNotifications, markNotifRead, markAllNotifsRead } from "../api/index";
import { socket } from "../api/index";

const SEVERITIES = ["all", "error", "warning", "critical", "info"];

const SEVERITY_STYLES = {
  error:    { badge: "bg-red-100 text-red-700 border-red-200",          icon: AlertCircle,   row: "bg-red-50/40"    },
  warning:  { badge: "bg-orange-100 text-orange-700 border-orange-200", icon: AlertTriangle, row: "bg-orange-50/40" },
  critical: { badge: "bg-rose-100 text-rose-800 border-rose-200",       icon: Zap,           row: "bg-rose-50/40"   },
  info:     { badge: "bg-blue-100 text-blue-700 border-blue-200",       icon: Info,          row: "bg-blue-50/20"   },
};

function formatDate(d) {
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
    timeZone: "Asia/Kolkata"
  });
}

export default function Notifications() {
  const [filter,        setFilter]        = useState("all");
  const [notifications, setNotifications] = useState([]);
  const [loading,       setLoading]       = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNotifications(filter === "all" ? undefined : filter);
      setNotifications(data);
    } catch (_) {}
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    socket.on("notification:new", (n) => {
      setNotifications(prev => [n, ...prev].slice(0, 100));
    });
    return () => socket.off("notification:new");
  }, []);

  const handleMarkRead = async (id) => {
    await markNotifRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
  };

  const handleMarkAll = async () => {
    await markAllNotifsRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
  };

  const unread = notifications.filter(n => !n.is_read).length;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-slate-400" />
          {SEVERITIES.map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors capitalize
                ${filter === s
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button onClick={handleMarkAll} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium px-3 py-1.5 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
              <CheckCheck size={13} /> Mark all read
            </button>
          )}
          <button onClick={fetchAll} className="flex items-center gap-1.5 text-xs text-slate-500 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg transition-colors">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={15} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">System Notifications</span>
            {unread > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unread} unread</span>
            )}
          </div>
          <span className="text-xs text-slate-400">{notifications.length} records</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-sm">
            <RefreshCw size={15} className="animate-spin" /> Loading notifications…
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
            <Bell size={36} className="opacity-20" />
            <span className="text-sm">No notifications found</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["Service", "Severity", "Title", "Message", "Status", "Created At", ""].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {notifications.map(n => {
                  const s = SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.info;
                  const Icon = s.icon;
                  return (
                    <tr key={n.id} className={`transition-colors hover:bg-slate-50 ${!n.is_read ? s.row : ""}`}>
                      <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
                          {n.service_name}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border capitalize ${s.badge}`}>
                          <Icon size={10} />
                          {n.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate">{n.title}</td>
                      <td className="px-4 py-3 text-slate-500 max-w-[260px]">
                        <span className="line-clamp-2 text-xs leading-relaxed">{n.message}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {n.is_read
                          ? <span className="text-xs text-slate-400 font-medium">Read</span>
                          : <span className="text-xs text-emerald-600 font-semibold">Unread</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{formatDate(n.created_at)}</td>
                      <td className="px-4 py-3">
                        {!n.is_read && (
                          <button onClick={() => handleMarkRead(n.id)} className="p-1.5 hover:bg-blue-50 rounded-md transition-colors group" title="Mark as read">
                            <CheckCheck size={13} className="text-slate-400 group-hover:text-blue-500" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
