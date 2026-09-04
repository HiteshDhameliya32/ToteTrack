import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
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

export default function DailyRecordsChart({ data, isLoading, isError }) {
  return (
    <ChartCard title="Daily Tote Cycles" subtitle="Last 30 days — PASS vs NR" isLoading={isLoading} isError={isError} height={220}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data ?? []} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barCategoryGap="30%">
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<Tip />} />
          <Legend iconType="circle" iconSize={8}
            formatter={v => <span className="text-xs text-slate-600">{v === "pass" ? "PASS" : "NR"}</span>} />
          <Bar dataKey="pass" stackId="a" fill="#059669" radius={[0, 0, 0, 0]} />
          <Bar dataKey="nr"   stackId="a" fill="#DC2626" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
