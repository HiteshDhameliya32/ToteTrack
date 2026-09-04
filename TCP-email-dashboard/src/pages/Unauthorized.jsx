import React from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export default function Unauthorized() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] p-6 text-center">
      <div className="inline-flex items-center justify-center w-20 h-20 bg-rose-50 border border-rose-200 rounded-full text-rose-500 mb-6 shadow-sm">
        <ShieldAlert className="w-10 h-10 animate-bounce" />
      </div>

      <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">403 - Forbidden</h1>
      
      <p className="text-slate-500 mt-3 max-w-md font-medium">
        You do not have permission to access this page. If you believe this is an error, please contact your administrator.
      </p>

      <div className="mt-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold shadow-md transition-all active:scale-[0.98]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
