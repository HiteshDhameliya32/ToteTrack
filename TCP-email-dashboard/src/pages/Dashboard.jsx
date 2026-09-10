import { useQuery } from "@tanstack/react-query";
import {
  getEnhancedStats,
  getChartMsgTrend, getChartEmailStatus, getChartDailyRecs,
  getChartEmailHist, getChartBusyHours, getChartZoneBreakdown,
  getChartZonePassRate, getChartZoneDailyTrend,
} from "../api";
import Card from "../components/ui/Card";
import { ErrorState } from "../components/ui/Misc";
import MessagesTrendChart  from "../components/charts/MessagesTrendChart";
import CycleStatusChart    from "../components/charts/CycleStatusChart";
import DailyRecordsChart   from "../components/charts/DailyRecordsChart";
import EmailHistoryChart   from "../components/charts/EmailHistoryChart";
import BusyHoursChart      from "../components/charts/BusyHoursChart";
import ZoneBreakdownChart  from "../components/charts/ZoneBreakdownChart";
import ZonePassRateChart   from "../components/charts/ZonePassRateChart";
import ZoneDailyTrendChart from "../components/charts/ZoneDailyTrendChart";
import DeviceStatusWidget  from "../components/DeviceStatusWidget";
import { Package, CheckCircle2, XCircle, Calendar, TrendingUp, Clock } from "lucide-react";

const REFETCH = 30_000;

/* ─── Stat card ───────────────────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, bg, ic, vc, border }) {
  return (
    <Card className={`hover:shadow-md transition-shadow duration-200 border ${border}`}>
      <div className={`inline-flex items-center justify-center h-9 w-9 rounded-lg ${bg} mb-3`}>
        <Icon size={18} className={ic} />
      </div>
      <div className={`text-2xl font-bold ${vc}`}>
        {typeof value === "number" ? value.toLocaleString() : (value ?? "—")}
      </div>
      <div className="text-xs text-slate-500 mt-1 font-medium">{label}</div>
      {sub != null && (
        <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const stats        = useQuery({ queryKey: ["enhanced-stats"],        queryFn: getEnhancedStats,        refetchInterval: REFETCH });
  const msgTrend     = useQuery({ queryKey: ["chart-msg-trend"],       queryFn: getChartMsgTrend,        refetchInterval: REFETCH });
  const cycleStat    = useQuery({ queryKey: ["chart-cycle-stat"],      queryFn: getChartEmailStatus,     refetchInterval: REFETCH });
  const dailyRecs    = useQuery({ queryKey: ["chart-daily-recs"],      queryFn: getChartDailyRecs,       refetchInterval: REFETCH });
  const emailHist    = useQuery({ queryKey: ["chart-email-hist"],      queryFn: getChartEmailHist,       refetchInterval: REFETCH });
  const busy         = useQuery({ queryKey: ["chart-busy-hours"],      queryFn: getChartBusyHours,       refetchInterval: REFETCH });
  const zones        = useQuery({ queryKey: ["chart-zone-breakdown"],  queryFn: getChartZoneBreakdown,   refetchInterval: REFETCH });
  const zonePassRate = useQuery({ queryKey: ["chart-zone-pass-rate"],  queryFn: getChartZonePassRate,    refetchInterval: REFETCH });
  const zoneTrend    = useQuery({ queryKey: ["chart-zone-daily-trend"],queryFn: getChartZoneDailyTrend, refetchInterval: REFETCH });

  const s        = stats.data;
  const passRate = s?.passRate ?? 0;

  const STAT_CARDS = [
    {
      key: "total",    label: "Total Totes",  value: s?.total,
      sub: `Today: ${s?.today ?? 0}`,
      icon: Package,      bg: "bg-blue-50",    ic: "text-blue-600",    vc: "text-blue-700",    border: "border-blue-100",
    },
    {
      key: "pass",     label: "Totes Passed", value: s?.pass,
      sub: `Today: ${s?.passToday ?? 0}`,
      icon: CheckCircle2, bg: "bg-emerald-50", ic: "text-emerald-600", vc: "text-emerald-700", border: "border-emerald-100",
    },
    {
      key: "nr",       label: "No Read (NR)", value: s?.nr,
      sub: `Today: ${s?.nrToday ?? 0}`,
      icon: XCircle,      bg: "bg-red-50",     ic: "text-red-500",     vc: "text-red-600",     border: "border-red-100",
    },
    {
      key: "passRate", label: "Pass Rate",    value: `${passRate}%`,
      sub: "All time",
      icon: TrendingUp,   bg: "bg-violet-50",  ic: "text-violet-600",  vc: "text-violet-700",  border: "border-violet-100",
    },
    {
      key: "today",    label: "Scans Today",  value: s?.today,
      sub: null,
      icon: Calendar,     bg: "bg-amber-50",   ic: "text-amber-600",   vc: "text-amber-700",   border: "border-amber-100",
    },
    {
      key: "activeSchedules", label: "Active Schedules", value: s?.activeSchedules,
      sub: "Email jobs",
      icon: Clock,        bg: "bg-cyan-50",    ic: "text-cyan-600",    vc: "text-cyan-700",    border: "border-cyan-100",
    },
  ];

  return (
    <div className="space-y-6">

      {/* ── Stat Cards ─────────────────────────────────────── */}
      {stats.isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white shadow-sm p-5 animate-pulse">
              <div className="h-9 w-9 rounded-lg bg-slate-100 mb-3" />
              <div className="h-7 w-16 rounded bg-slate-100 mb-2" />
              <div className="h-3 w-24 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : stats.isError ? (
        <ErrorState message="Failed to load stats" />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
          {STAT_CARDS.map(c => <StatCard key={c.key} {...c} />)}
        </div>
      )}

      {/* ── Row 1: Hourly Trend + PASS/NR Pie ─────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <MessagesTrendChart
            data={msgTrend.data}
            isLoading={msgTrend.isLoading}
            isError={msgTrend.isError}
          />
        </div>
        <CycleStatusChart
          data={cycleStat.data}
          isLoading={cycleStat.isLoading}
          isError={cycleStat.isError}
        />
      </div>

      {/* ── Row 2: Daily Cycles + Zone Breakdown ───────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <DailyRecordsChart
          data={dailyRecs.data}
          isLoading={dailyRecs.isLoading}
          isError={dailyRecs.isError}
        />
        <ZoneBreakdownChart
          data={zones.data}
          isLoading={zones.isLoading}
          isError={zones.isError}
        />
      </div>

      {/* ── Row 3: Zone Pass Rate + Zone Daily Trend ───────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ZonePassRateChart
          data={zonePassRate.data}
          isLoading={zonePassRate.isLoading}
          isError={zonePassRate.isError}
        />
        <ZoneDailyTrendChart
          data={zoneTrend.data}
          isLoading={zoneTrend.isLoading}
          isError={zoneTrend.isError}
        />
      </div>

      {/* ── Row 4: Peak Hours + Email History + Device Status ─ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <BusyHoursChart
          data={busy.data}
          isLoading={busy.isLoading}
          isError={busy.isError}
        />
        <EmailHistoryChart
          data={emailHist.data}
          isLoading={emailHist.isLoading}
          isError={emailHist.isError}
        />
        <DeviceStatusWidget />
      </div>

    </div>
  );
}
