import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from "recharts";
import ChartCard from "../ui/ChartCard";

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const total = (d?.pass ?? 0) + (d?.nr ?? 0);
  const rate  = total > 0 ? Math.round((d.pass / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs min-w-32">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      <p className="text-emerald-600">PASS: <span className="font-bold">{d?.pass ?? 0}</span></p>
      <p className="text-red-500">NR: <span className="font-bold">{d?.nr ?? 0}</span></p>
      <p className="text-slate-500 mt-1">Pass rate: <span className="font-bold text-slate-700">{rate}%</span></p>
    </div>
  );
};

export default function ZoneBreakdownChart({ data, isLoading, isError }) {
  // Use zone_name as the X-axis label
  const chartData = (data ?? []).map(d => ({ ...d, name: d.zone_name }));

  return (
    <ChartCard title="Zone-wise Performance" subtitle="PASS vs NR per location" isLoading={isLoading} isError={isError} height={220}>
      {!chartData.length && !isLoading ? (
        <div className="flex items-center justify-center h-48 text-xs text-slate-400">
          No zone data yet — cycles will appear here once scanning starts.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#64748B" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip content={<Tip />} />
            <Legend iconType="circle" iconSize={8}
              formatter={v => <span className="text-xs text-slate-600">{v === "pass" ? "PASS" : "NR"}</span>} />
            <Bar dataKey="pass" stackId="a" fill="#059669" radius={[0, 0, 0, 0]} />
            <Bar dataKey="nr"   stackId="a" fill="#DC2626" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
