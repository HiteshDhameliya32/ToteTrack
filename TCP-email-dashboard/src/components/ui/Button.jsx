export default function Button({ children, onClick, variant = "primary", size = "md", disabled, className = "", type = "button" }) {
  const base = "inline-flex items-center gap-2 rounded-lg font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-2.5 text-base",
  };
  const variants = {
    primary: "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm",
    danger:  "bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm",
    ghost:   "bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 border border-slate-200 shadow-sm",
    success: "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-sm",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
