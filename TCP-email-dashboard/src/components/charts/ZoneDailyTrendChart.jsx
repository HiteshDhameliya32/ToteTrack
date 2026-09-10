import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import ChartCard from "../ui/ChartCard";

// Distinct colour palette for zones
const ZONE_COLORS = [
  "#2563eb", "#059669", "#d97706", "#7c3aed",
  "#db2777", "#0891b2", "#65a30d", "#ea580c",
];

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs min-w-36">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value ?? 0}</span>
        </p>
      ))}
    </div>
  );
};

export default function ZoneDailyTrendChart({ data, isLoading, isError }) {
  const days      = data?.days      ?? [];
  const zoneNames = data?.zoneNames ?? [];

  return (
    <ChartCard
      title="Zone Daily Trend"
      subtitle="PASS cycles per zone — last 7 days"
      isLoading={isLoading}
      isError={isError}
      height={220}
    >
      {(!days.length || !zoneNames.length) && !isLoading ? (
        <div className="flex items-center justify-center h-48 text-xs text-slate-400">
          No zone data yet — cycles will appear here once scanning starts.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={days} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "#64748B" }}
              tickLine={false} axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#94A3B8" }}
              tickLine={false} axisLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<Tip />} />
            <Legend
              iconType="circle" iconSize={8}
              formatter={v => <span className="text-xs text-slate-600">{v}</span>}
            />
            {zoneNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={`${name}_pass`}
                name={name}
                stroke={ZONE_COLORS[i % ZONE_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
