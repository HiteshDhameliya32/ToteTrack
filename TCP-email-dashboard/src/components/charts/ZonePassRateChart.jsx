import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, LabelList,
} from "recharts";
import ChartCard from "../ui/ChartCard";

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs min-w-36">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      <p className="text-emerald-600">Pass Rate: <span className="font-bold">{d?.pass_rate ?? 0}%</span></p>
      <p className="text-emerald-600">PASS: <span className="font-bold">{d?.pass ?? 0}</span></p>
      <p className="text-red-500">NR: <span className="font-bold">{d?.nr ?? 0}</span></p>
      <p className="text-slate-500">Total: <span className="font-bold text-slate-700">{d?.total ?? 0}</span></p>
    </div>
  );
};

function rateColor(rate) {
  if (rate >= 90) return "#059669"; // emerald
  if (rate >= 70) return "#d97706"; // amber
  return "#dc2626";                 // red
}

export default function ZonePassRateChart({ data, isLoading, isError }) {
  const chartData = (data ?? []).map(d => ({ ...d, name: d.zone_name }));

  return (
    <ChartCard
      title="Zone Pass Rate"
      subtitle="% of PASS cycles per zone (all time)"
      isLoading={isLoading}
      isError={isError}
      height={220}
    >
      {!chartData.length && !isLoading ? (
        <div className="flex items-center justify-center h-48 text-xs text-slate-400">
          No zone data yet — cycles will appear here once scanning starts.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 48, left: 8, bottom: 0 }}
            barCategoryGap="30%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
            <XAxis
              type="number" domain={[0, 100]}
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickLine={false} axisLine={false}
              tickFormatter={v => `${v}%`}
            />
            <YAxis
              type="category" dataKey="name"
              tick={{ fontSize: 10, fill: "#64748B" }}
              tickLine={false} axisLine={false}
              width={56}
            />
            <Tooltip content={<Tip />} cursor={{ fill: "#F8FAFC" }} />
            <Bar dataKey="pass_rate" radius={[0, 4, 4, 0]}>
              <LabelList
                dataKey="pass_rate"
                position="right"
                formatter={v => `${v}%`}
                style={{ fontSize: 10, fill: "#475569", fontWeight: 600 }}
              />
              {chartData.map((entry, i) => (
                <Cell key={i} fill={rateColor(entry.pass_rate)} fillOpacity={0.9} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
