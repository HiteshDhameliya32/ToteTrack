import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import ChartCard from "../ui/ChartCard";

const COLORS = ["#2563EB", "#F59E0B"];

const Tip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-slate-600">{payload[0].name}</p>
      <p style={{ color: payload[0].payload.fill }}>Count: <span className="font-bold">{payload[0].value.toLocaleString()}</span></p>
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
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function EmailStatusChart({ data, isLoading, isError }) {
  const filled = (data ?? []).map((d, i) => ({ ...d, fill: COLORS[i % COLORS.length] }));
  return (
    <ChartCard title="Email Status Distribution" subtitle="Sent vs Pending all time" isLoading={isLoading} isError={isError} height={220}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={filled} dataKey="value" nameKey="name" cx="50%" cy="50%"
            outerRadius={88} labelLine={false} label={renderLabel}>
            {filled.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
          </Pie>
          <Tooltip content={<Tip />} />
          <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs text-slate-600">{v}</span>} />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
