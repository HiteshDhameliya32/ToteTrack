import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import ChartCard from "../ui/ChartCard";

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs space-y-1">
      <p className="font-semibold text-slate-600">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <span className="font-bold">{p.value?.toLocaleString()}</span></p>
      ))}
    </div>
  );
};

export default function EmailHistoryChart({ data, isLoading, isError }) {
  return (
    <ChartCard title="Email Delivery History" subtitle="Last 30 days · successful sends" isLoading={isLoading} isError={isError} height={220}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data ?? []} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94A3B8" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<Tip />} />
          <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-slate-600 capitalize">{v}</span>} />
          <Line type="monotone" dataKey="emails" name="Emails Sent" stroke="#16A34A" strokeWidth={2} dot={{ r: 3, fill: "#16A34A", strokeWidth: 0 }} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="records" name="Records Sent" stroke="#0891B2" strokeWidth={2} dot={{ r: 3, fill: "#0891B2", strokeWidth: 0 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
