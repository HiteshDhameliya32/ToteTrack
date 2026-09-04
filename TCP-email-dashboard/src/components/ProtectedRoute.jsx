import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../store/AuthContext";

export default function ProtectedRoute({ children, permission, superAdminOnly = false }) {
  const { token, user, loading, can } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="text-slate-500 font-medium animate-pulse">Verifying credentials...</p>
        </div>
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Check super admin restriction
  if (superAdminOnly && user?.role !== "Super Admin") {
    return <Navigate to="/403" replace />;
  }

  if (permission && !can(permission)) {
    return <Navigate to="/403" replace />;
  }

  return children;
}
