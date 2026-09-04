export default function Card({ children, className = "" }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className.includes("p-") ? "" : "p-5"} ${className}`}>
      {children}
    </div>
  );
}
