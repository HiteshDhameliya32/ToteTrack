import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import ChartCard from "../ui/ChartCard";

const COLORS = { PASS: "#059669", NR: "#DC2626" };

const Tip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-slate-600">{d.name}</p>
      <p style={{ color: COLORS[d.name] ?? "#64748b" }}>
        Count: <span className="font-bold">{d.value.toLocaleString()}</span>
      </p>
    </div>
  );
};

const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.04) return null;
  const RAD = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RAD);
  const y = cy + r * Math.sin(-midAngle * RAD);
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function CycleStatusChart({ data, isLoading, isError }) {
  const filled = (data ?? []).map(d => ({ ...d, fill: COLORS[d.name] ?? "#94a3b8" }));
  const total  = filled.reduce((s, d) => s + d.value, 0);

  return (
    <ChartCard title="PASS / NR Distribution" subtitle="All time cycle results" isLoading={isLoading} isError={isError} height={220}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={filled} dataKey="value" nameKey="name"
            cx="50%" cy="50%" outerRadius={82} labelLine={false} label={renderLabel}>
            {filled.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Pie>
          <Tooltip content={<Tip />} />
          <Legend iconType="circle" iconSize={8}
            formatter={(v, entry) => (
              <span className="text-xs text-slate-600">
                {v} ({entry.payload?.value?.toLocaleString() ?? 0})
              </span>
            )} />
        </PieChart>
      </ResponsiveContainer>
      {total > 0 && (
        <p className="text-center text-xs text-slate-400 -mt-1">
          {total.toLocaleString()} total cycles
        </p>
      )}
    </ChartCard>
  );
}
