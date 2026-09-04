import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import ChartCard from "../ui/ChartCard";

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-slate-600 mb-1">{label}</p>
      <p className="text-emerald-600">PASS: <span className="font-bold">{payload.find(p => p.dataKey === "pass")?.value ?? 0}</span></p>
      <p className="text-red-500">NR: <span className="font-bold">{payload.find(p => p.dataKey === "nr")?.value ?? 0}</span></p>
    </div>
  );
};

export default function MessagesTrendChart({ data, isLoading, isError }) {
  return (
    <ChartCard title="Scan Activity — Last 24 Hours" subtitle="Tote cycles by hour" isLoading={isLoading} isError={isError} height={220}>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data ?? []} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="passGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#059669" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#059669" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="nrGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#DC2626" stopOpacity={0.12} />
              <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
          <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<Tip />} />
          <Legend iconType="circle" iconSize={8}
            formatter={v => <span className="text-xs text-slate-600 capitalize">{v === "pass" ? "PASS" : "NR"}</span>} />
          <Area type="monotone" dataKey="pass" stroke="#059669" strokeWidth={2}
            fill="url(#passGrad)" dot={{ r: 3, fill: "#059669", strokeWidth: 0 }} activeDot={{ r: 5 }} />
          <Area type="monotone" dataKey="nr" stroke="#DC2626" strokeWidth={2}
            fill="url(#nrGrad)" dot={{ r: 3, fill: "#DC2626", strokeWidth: 0 }} activeDot={{ r: 5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
