import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import ChartCard from "../ui/ChartCard";

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-slate-600 mb-1">{label}</p>
      <p className="text-slate-700">Total: <span className="font-bold">{d?.total ?? 0}</span></p>
      <p className="text-emerald-600">PASS: <span className="font-bold">{d?.pass ?? 0}</span></p>
      <p className="text-red-500">NR: <span className="font-bold">{d?.nr ?? 0}</span></p>
    </div>
  );
};

export default function BusyHoursChart({ data, isLoading, isError }) {
  const sorted = [...(data ?? [])].sort((a, b) => a.hour.localeCompare(b.hour));
  const max = Math.max(...sorted.map(d => d.total), 1);

  return (
    <ChartCard title="Peak Scan Hours" subtitle="Busiest hours all time" isLoading={isLoading} isError={isError} height={220}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap="25%">
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="hour" tick={{ fontSize: 10, fill: "#64748B" }} tickLine={false} axisLine={false} width={42} />
          <Tooltip content={<Tip />} cursor={{ fill: "#F8FAFC" }} />
          <Bar dataKey="total" radius={[0, 4, 4, 0]}>
            {sorted.map((entry, i) => (
              <Cell key={i} fill={entry.total === max ? "#1e40af" : "#3b82f6"} fillOpacity={0.85 - (i * 0.03)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
