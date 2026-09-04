import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import ToastContainer from "./components/ui/Toast";
import Dashboard from "./pages/Dashboard";
import Schedules from "./pages/Schedules";
import Recipients from "./pages/Recipients";
import EmailHistory from "./pages/EmailHistory";
import PendingMessages from "./pages/PendingMessages";
import Records from "./pages/Records";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import Notifications from "./pages/Notifications";
import Users from "./pages/Users";
import Login from "./pages/Login";
import Unauthorized from "./pages/Unauthorized";
import TcpConfig from "./pages/TcpConfig";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider, useAuth } from "./store/AuthContext";
import Footer from "./components/Footer";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 10000 } } });

function AppContent() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="text-slate-500 font-medium animate-pulse">Initializing system...</p>
        </div>
      </div>
    );
  }

  // If not logged in, force Login page rendering only
  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Main Authenticated Layout
  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Fixed sidebar */}

      {/* Fixed sidebar */}
      <Sidebar />

      {/* Right side: fixed header + scrollable content */}
      <div className="ml-56 flex-1 flex flex-col min-h-screen">
        <Header />
        
        {/* pt-16 offsets content below the fixed 64px header */}
        <main className="flex-1 flex flex-col pt-16 bg-slate-50 mt-16">
          <div className="flex-1 p-6 lg:p-8">
            <Routes>
              <Route path="/"              element={<ProtectedRoute permission="VIEW_DASHBOARD"><Dashboard /></ProtectedRoute>} />
              <Route path="/schedules"     element={<ProtectedRoute permission="MANAGE_SCHEDULES"><Schedules /></ProtectedRoute>} />
              <Route path="/recipients"    element={<ProtectedRoute permission="MANAGE_RECIPIENTS"><Recipients /></ProtectedRoute>} />
              <Route path="/email-history" element={<ProtectedRoute permission="VIEW_EMAIL_LOGS"><EmailHistory /></ProtectedRoute>} />
              <Route path="/pending"       element={<ProtectedRoute permission="VIEW_RECORDS" superAdminOnly={true}><PendingMessages /></ProtectedRoute>} />
              <Route path="/records"       element={<ProtectedRoute permission="VIEW_RECORDS"><Records /></ProtectedRoute>} />
              <Route path="/reports"       element={<ProtectedRoute permission="VIEW_RECORDS"><Reports /></ProtectedRoute>} />
              <Route path="/settings"      element={<ProtectedRoute permission="MANAGE_SETTINGS"><Settings /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute permission="VIEW_NOTIFICATIONS"><Notifications /></ProtectedRoute>} />
              <Route path="/users"         element={<ProtectedRoute permission="CREATE_USERS"><Users /></ProtectedRoute>} />
              <Route path="/tcp-config"    element={<ProtectedRoute permission="MANAGE_TCP_CONFIG"><TcpConfig /></ProtectedRoute>} />
              <Route path="/403"           element={<Unauthorized />} />
              <Route path="*"              element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <AppContent />
          <ToastContainer />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
