import { useQuery } from "@tanstack/react-query";
import { getDeviceStatus } from "../api";
import { Wifi, WifiOff, RefreshCw } from "lucide-react";
import Card from "./ui/Card";

export default function DeviceStatusWidget() {
  const { data, isLoading, isError, isFetching, dataUpdatedAt } = useQuery({
    queryKey:      ["device-status"],
    queryFn:       getDeviceStatus,
    refetchInterval: 10_000,   // poll every 10 s
    refetchIntervalInBackground: true,
  });

  const devices    = data ?? [];
  const connected  = devices.filter(d => d.connected).length;
  const total      = devices.length;
  const allOk      = total > 0 && connected === total;
  const someDown   = connected < total && connected > 0;
  const allDown    = total > 0 && connected === 0;

  // Group by zone
  const zones = {};
  for (const d of devices) {
    const key = d.zone_name || `Zone ${d.zone_id}`;
    if (!zones[key]) zones[key] = [];
    zones[key].push(d);
  }

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("en-IN", { hour12: false, timeZone: "Asia/Kolkata" })
    : null;

  return (
    <Card className="p-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className={`w-2.5 h-2.5 rounded-full ${
            allOk    ? "bg-emerald-500 shadow-[0_0_6px_2px_rgba(16,185,129,0.4)]" :
            allDown  ? "bg-red-500 shadow-[0_0_6px_2px_rgba(239,68,68,0.4)]" :
                       "bg-amber-400 shadow-[0_0_6px_2px_rgba(251,191,36,0.4)]"
          } animate-pulse`} />
          <h2 className="text-sm font-semibold text-slate-700">Device Status</h2>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && <RefreshCw size={11} className="animate-spin text-slate-400" />}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
            allOk   ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
            allDown ? "bg-red-50 text-red-600 border-red-100" :
                      "bg-amber-50 text-amber-700 border-amber-100"
          }`}>
            {connected}/{total} online
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => (
              <div key={i} className="h-9 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : isError ? (
          <p className="text-xs text-red-500 text-center py-4">Failed to load device status</p>
        ) : devices.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">
            No devices configured. Add devices in TCP Config.
          </p>
        ) : (
          <div className="space-y-4">
            {Object.entries(zones).map(([zoneName, devs]) => (
              <div key={zoneName}>
                {/* Zone label */}
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  {zoneName}
                </p>
                <div className="space-y-1.5">
                  {devs.map(d => (
                    <div
                      key={d.id}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 border transition-colors ${
                        d.connected
                          ? "bg-emerald-50 border-emerald-100"
                          : "bg-red-50 border-red-100"
                      }`}
                    >
                      {/* Left: icon + address */}
                      <div className="flex items-center gap-2">
                        {d.connected
                          ? <Wifi size={14} className="text-emerald-600 shrink-0" />
                          : <WifiOff size={14} className="text-red-500 shrink-0" />
                        }
                        <span className="font-mono text-xs font-semibold text-slate-700">
                          {d.host}:{d.port}
                        </span>
                      </div>

                      {/* Right: status badge */}
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        d.connected
                          ? "text-emerald-700 bg-white border border-emerald-200"
                          : "text-red-600 bg-white border border-red-200"
                      }`}>
                        {d.connected ? "● Online" : "● Offline"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {lastUpdated && (
        <div className="px-5 pb-3 text-xs text-slate-400">
          Last checked: {lastUpdated}
        </div>
      )}
    </Card>
  );
}
