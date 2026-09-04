export function Badge({ children, color = "blue" }) {
  const colors = {
    blue:   "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
    green:  "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    red:    "bg-red-50 text-red-700 ring-1 ring-red-200",
    yellow: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    slate:  "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
    </div>
  );
}

export function EmptyState({ message = "No data found" }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <div className="mb-3 text-4xl">📭</div>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

export function ErrorState({ message = "Something went wrong" }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-red-500">
      <div className="mb-3 text-4xl">⚠️</div>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}
