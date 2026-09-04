import { useToastStore } from "../../store/toast.store";

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg transition-all duration-300
            ${t.type === "success"
              ? "bg-white border-emerald-200 text-emerald-800 border-l-4 border-l-emerald-500"
              : t.type === "error"
              ? "bg-white border-red-200 text-red-800 border-l-4 border-l-red-500"
              : "bg-white border-slate-200 text-slate-800 border-l-4 border-l-blue-500"
            }`}
        >
          <span>
            {t.type === "success" ? "✅" : t.type === "error" ? "❌" : "ℹ️"}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
}
