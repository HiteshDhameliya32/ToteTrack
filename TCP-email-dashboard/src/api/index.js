import axios from "axios";
import { io } from "socket.io-client";

const api = axios.create({ baseURL: "/api" });

// Intercept requests to inject the token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Intercept responses to handle 401 Unauthorized globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem("token");
      // Optionally trigger reload or redirect to login
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export const socket = io({ path: "/socket.io", autoConnect: true, reconnectionDelay: 3000 });

// Auth
export const loginUser = (email, password) => api.post("/auth/login", { email, password }).then(r => r.data);
const authMeMock = () => api.get("/auth/me").then(r => r.data.user);
export { authMeMock as authMe };

// Users Management
export const getUsers = () => api.get("/users").then(r => r.data.data);
export const createUser = (data) => api.post("/users", data).then(r => r.data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data).then(r => r.data);
export const deleteUser = (id) => api.delete(`/users/${id}`).then(r => r.data);
export const getUserPermissions = (id) => api.get(`/users/${id}/permissions`).then(r => r.data);
export const updateUserPermissions = (id, permissions) => api.put(`/users/${id}/permissions`, { permissions }).then(r => r.data);

// Companies Management
export const getCompanies = () => api.get("/companies").then(r => r.data.data);
export const createCompany = (name) => api.post("/companies", { name }).then(r => r.data);

// Dashboard
export const getStats = () => api.get("/dashboard/stats").then(r => r.data.data);
export const getEnhancedStats = () => api.get("/dashboard/enhanced-stats").then(r => r.data.data);
export const getChartMsgTrend     = () => api.get("/dashboard/charts/messages-trend").then(r => r.data.data);
export const getChartEmailStatus  = () => api.get("/dashboard/charts/email-status").then(r => r.data.data);
export const getChartDailyRecs    = () => api.get("/dashboard/charts/daily-records").then(r => r.data.data);
export const getChartEmailHist    = () => api.get("/dashboard/charts/email-history").then(r => r.data.data);
export const getChartBusyHours    = () => api.get("/dashboard/charts/busy-hours").then(r => r.data.data);
export const getChartZoneBreakdown= () => api.get("/dashboard/charts/zone-breakdown").then(r => r.data.data);
export const getChartZonePassRate  = () => api.get("/dashboard/charts/zone-pass-rate").then(r => r.data.data);
export const getChartZoneDailyTrend= () => api.get("/dashboard/charts/zone-daily-trend").then(r => r.data);

// Schedules
export const getSchedules = () => api.get("/schedules").then(r => r.data.data);
export const createSchedule = (time) => api.post("/schedules", { time });
export const updateSchedule = (id, data) => api.put(`/schedules/${id}`, data);
export const deleteSchedule = (id) => api.delete(`/schedules/${id}`);

// Recipients
export const getRecipients = () => api.get("/emails").then(r => r.data.data);
export const createRecipient = (email) => api.post("/emails", { email });
export const updateRecipient = (id, data) => api.put(`/emails/${id}`, data);
export const deleteRecipient = (id) => api.delete(`/emails/${id}`);

// Email Logs
export const getEmailLogs = (page = 1) => api.get(`/email-logs?page=${page}`).then(r => r.data);
export const sendNow = () => api.post("/email-logs/send-now");

// Pending Messages
export const getPending = (page = 1, search = "") =>
  api.get(`/messages/pending?page=${page}&search=${encodeURIComponent(search)}`).then(r => r.data);

// Records
export const getRecords = (params) => api.get("/records", { params }).then(r => r.data);
export const getRecentRecords = () => api.get("/records/recent").then(r => r.data.data);
export const sendSelectedRecords = (ids) => api.post("/records/send-selected", { ids });
export const sendFilteredRecords = (filters) => api.post("/records/send-filtered", filters);
export const deleteSelectedRecords = (ids) => api.delete("/records/delete-selected", { data: { ids } }).then(r => r.data);
export const deleteFilteredRecords = (filters) => api.delete("/records/delete-filtered", { data: filters }).then(r => r.data);

// Active Schedules (for dashboard widget)
export const getActiveSchedules = () =>
  api.get("/schedules").then(r => r.data.data.filter(s => s.active));

// SMTP Settings
export const getSmtpSettings = () => api.get("/settings/smtp").then(r => r.data);
export const updateSmtpSettings = (data) => api.put("/settings/smtp", data);
export const testEmail = (to) => api.post("/settings/test-email", { to });

// TCP Config (camera_configs)
export const getTcpCameras = () => api.get("/cameras").then(r => r.data);
export const createTcpCamera = (data) => api.post("/cameras", data).then(r => r.data);
export const updateTcpCamera = (id, data) => api.put(`/cameras/${id}`, data).then(r => r.data);
export const deleteTcpCamera = (id) => api.delete(`/cameras/${id}`).then(r => r.data);
export const getTcpStatuses = () => api.get("/statuses").then(r => r.data);

export const getTcpClientConfig    = () => api.get("/tcp-client-config").then(r => r.data);
export const updateTcpClientConfig = (data) => api.put("/tcp-client-config", data).then(r => r.data);

// Zone management
export const getTcpZones   = ()     => api.get("/tcp-zones").then(r => r.data);
export const createTcpZone = (data) => api.post("/tcp-zones", data).then(r => r.data);
export const deleteTcpZone = (id)   => api.delete(`/tcp-zones/${id}`).then(r => r.data);

// Zones list — all zones for dropdowns (not user-scoped)
export const getZonesList = () => api.get("/zones-list").then(r => r.data.data);

// Notifications
export const getNotifications    = (severity) => api.get("/notifications", { params: severity ? { severity } : {} }).then(r => r.data.data);
export const getUnreadCount      = () => api.get("/notifications/unread-count").then(r => r.data.count);
export const markNotifRead       = (id) => api.put(`/notifications/${id}/read`);
export const markAllNotifsRead   = () => api.put("/notifications/read-all");

// Device connection status — auto-refreshes every 10s on dashboard
export const getDeviceStatus = () => api.get("/devices/status").then(r => r.data.data);

// Reports
export const getReportPreview = (params) => api.get("/reports/preview", { params }).then(r => r.data);
// Download returns a blob — use raw api instance with responseType blob
export const downloadReport = (params) => api.get("/reports/download", { params, responseType: "blob" });
// Send report email to all recipients — returns 202 immediately, backend processes in background
export const sendReportEmail = (body) => api.post("/reports/email", body).then(r => r.data);

// File Manager (Super Admin only)
export const fmList         = (path = "")           => api.get("/files",               { params: { path } }).then(r => r.data);
export const fmRead         = (path)                => api.get("/files/read",           { params: { path } }).then(r => r.data);
export const fmSave         = (path, content)       => api.put("/files/save",           { path, content }).then(r => r.data);
export const fmCreateFile   = (path, name)          => api.post("/files/create-file",   { path, name }).then(r => r.data);
export const fmCreateFolder = (path, name)          => api.post("/files/create-folder", { path, name }).then(r => r.data);
export const fmRename       = (path, newName)       => api.put("/files/rename",         { path, newName }).then(r => r.data);
export const fmDelete       = (path)               => api.delete("/files/delete",       { data: { path } }).then(r => r.data);
export const fmDownload     = (path) => {
  const token = localStorage.getItem("token");
  const url   = `/api/files/download?path=${encodeURIComponent(path)}`;
  const a     = document.createElement("a");
  a.href      = url;
  // Attach token via a hidden fetch → blob, then trigger link click
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.blob())
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob);
      a.href        = blobUrl;
      a.download    = path.split("/").pop();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    });
};
export const fmUpload = (path, file) => {
  const form = new FormData();
  form.append("file", file);
  return api.post(`/files/upload?path=${encodeURIComponent(path)}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data);
};

// Database Migration (Super Admin only)
export const runMigration = () => api.post("/admin/migrate").then(r => r.data);

export default api;
