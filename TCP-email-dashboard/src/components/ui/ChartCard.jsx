export default function ChartCard({ title, subtitle, children, isLoading, isError, height = 240 }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-2" style={{ height }}>
          <div className="h-full w-full rounded-lg bg-slate-100" />
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center text-slate-400 text-xs" style={{ height }}>
          ⚠️ Failed to load chart data
        </div>
      ) : (
        children
      )}
    </div>
  );
}
