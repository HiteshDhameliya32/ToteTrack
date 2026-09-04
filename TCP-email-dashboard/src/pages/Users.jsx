import React, { useState, useEffect } from "react";
import { useAuth } from "../store/AuthContext";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  getCompanies,
  getUserPermissions,
  updateUserPermissions,
} from "../api";
import {
  UserPlus,
  Edit2,
  Trash2,
  Shield,
  Check,
  X,
  UserCheck,
  UserX,
  Plus,
  Loader2,
  Building,
} from "lucide-react";
import { useToastStore } from "../store/toast.store";

const ALL_PERMISSIONS = [
  { code: "VIEW_DASHBOARD", name: "View Dashboard" },
  { code: "VIEW_RECORDS", name: "View Records" },
  { code: "SEND_EMAIL", name: "Send Email" },
  { code: "VIEW_EMAIL_LOGS", name: "View Email Logs" },
  { code: "MANAGE_RECIPIENTS", name: "Manage Recipients" },
  { code: "MANAGE_SCHEDULES", name: "Manage Schedules" },
  { code: "VIEW_NOTIFICATIONS", name: "View Notifications" },
  { code: "MANAGE_SETTINGS", name: "Manage Settings" },
  { code: "CREATE_USERS", name: "Create Users" },
  { code: "EDIT_USERS", name: "Edit Users" },
  { code: "DELETE_USERS", name: "Delete Users" },
  { code: "MANAGE_TCP_CONFIG", name: "Manage TCP Config" },
];

export default function Users() {
  const { user: currentUser, can } = useAuth();
  const toast = useToastStore((s) => s.addToast);

  const [users, setUsers] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState("create"); // 'create' | 'edit'
  const [selectedUser, setSelectedUser] = useState(null);

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("User");
  const [companyId, setCompanyId] = useState("");
  const [active, setActive] = useState(true);
  const [permissions, setPermissions] = useState([]); // Array of code strings

  // Load initial data
  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getUsers();
      setUsers(data);

      if (currentUser.role === "Super Admin") {
        const comps = await getCompanies();
        setCompanies(comps);
      }
    } catch (err) {
      console.error(err);
      toast("Failed to load users list", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setModalType("create");
    setSelectedUser(null);
    setName("");
    setEmail("");
    setPassword("");
    setRole("User");
    setCompanyId(currentUser.role === "Super Admin" ? (companies[0]?.id || "") : "");
    setActive(true);
    setPermissions(["VIEW_DASHBOARD", "VIEW_RECORDS"]); // default permissions
    setShowModal(true);
  };

  const openEditModal = async (user) => {
    setModalType("edit");
    setSelectedUser(user);
    setName(user.name);
    setEmail(user.email);
    setPassword(""); // Leave blank unless changing
    setRole(user.role);
    setCompanyId(user.company_id);
    setActive(user.active === 1);
    
    // Fetch user's actual permissions
    try {
      const resp = await getUserPermissions(user.id);
      setPermissions(resp.assigned || []);
    } catch (err) {
      setPermissions([]);
    }

    setShowModal(true);
  };

  const handleTogglePermission = (code) => {
    if (permissions.includes(code)) {
      setPermissions(permissions.filter((p) => p !== code));
    } else {
      setPermissions([...permissions, code]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (modalType === "create" && !password) {
      toast("Password is required for new users", "error");
      return;
    }

    try {
      if (modalType === "create") {
        const payload = {
          name,
          email,
          password,
          role,
          active: active ? 1 : 0,
          company_id: currentUser.role === "Super Admin" ? companyId : undefined,
          permissions,
        };
        await createUser(payload);
        toast("User created successfully", "success");
      } else {
        const payload = {
          name,
          email,
          role,
          active: active ? 1 : 0,
          company_id: currentUser.role === "Super Admin" ? companyId : undefined,
        };
        if (password) payload.password = password;

        await updateUser(selectedUser.id, payload);
        // Also update permissions
        await updateUserPermissions(selectedUser.id, permissions);
        toast("User updated successfully", "success");
      }

      setShowModal(false);
      loadData();
    } catch (err) {
      toast(err.response?.data?.message || err.message || "An error occurred", "error");
    }
  };

  const handleDelete = async (id, userName) => {
    if (!window.confirm(`Are you sure you want to delete user "${userName}"?`)) return;
    try {
      await deleteUser(id);
      toast("User removed successfully", "success");
      loadData();
    } catch (err) {
      toast(err.response?.data?.message || err.message || "An error occurred", "error");
    }
  };

  const handleToggleActive = async (user) => {
    try {
      const newActive = user.active === 1 ? 0 : 1;
      await updateUser(user.id, {
        name: user.name,
        email: user.email,
        role: user.role,
        active: newActive,
      });
      toast(`User ${user.email} is now ${newActive ? "Active" : "Inactive"}.`, "success");
      loadData();
    } catch (err) {
      toast("Failed to update user status", "error");
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Users Management</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Manage system operators, set company assignments, and adjust access permissions.
          </p>
        </div>
        {can("CREATE_USERS") && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-md shadow-indigo-600/10 transition-all active:scale-[0.98] cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            Add User
          </button>
        )}
      </div>

      {/* Users Table Card */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <th className="py-4 px-6">User</th>
                {currentUser.role === "Super Admin" && <th className="py-4 px-6">Company</th>}
                <th className="py-4 px-6">Role</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6">Created At</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                  {/* User Identity */}
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center font-bold text-indigo-600">
                        {u.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-950">{u.name}</div>
                        <div className="text-slate-400 text-xs mt-0.5">{u.email}</div>
                      </div>
                    </div>
                  </td>

                  {/* Company for Super Admin */}
                  {currentUser.role === "Super Admin" && (
                    <td className="py-4 px-6">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg font-medium text-xs">
                        <Building className="w-3.5 h-3.5 text-slate-400" />
                        {u.company_name}
                      </div>
                    </td>
                  )}

                  {/* Role Badge */}
                  <td className="py-4 px-6">
                    <div className="inline-flex items-center gap-1">
                      <Shield className={`w-4 h-4 ${u.role === "Super Admin" ? "text-amber-500" : u.role === "Admin" ? "text-blue-500" : "text-slate-400"}`} />
                      <span className={`font-semibold ${u.role === "Super Admin" ? "text-amber-700" : u.role === "Admin" ? "text-blue-700" : "text-slate-600"}`}>
                        {u.role}
                      </span>
                    </div>
                  </td>

                  {/* Status Toggle */}
                  <td className="py-4 px-6">
                    <button
                      disabled={!can("EDIT_USERS") || u.id === currentUser.id}
                      onClick={() => handleToggleActive(u)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold text-xs border transition-all ${
                        u.active === 1
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 cursor-pointer"
                          : "bg-rose-50 text-rose-700 border-rose-200 cursor-pointer"
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {u.active === 1 ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5" /> Active
                        </>
                      ) : (
                        <>
                          <UserX className="w-3.5 h-3.5" /> Inactive
                        </>
                      )}
                    </button>
                  </td>

                  {/* Created At */}
                  <td className="py-4 px-6 text-slate-400 text-xs">
                    {new Date(u.created_at).toLocaleDateString("en-US", { timeZone: "Asia/Kolkata" })}
                  </td>

                  {/* Action Buttons */}
                  <td className="py-4 px-6 text-right">
                    <div className="inline-flex items-center gap-1">
                      {can("EDIT_USERS") && (
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit User & Permissions"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}

                      {can("DELETE_USERS") && u.id !== currentUser.id && (
                        <button
                          onClick={() => handleDelete(u.id, u.name)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Delete User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={currentUser.role === "Super Admin" ? 6 : 5} className="py-12 text-center text-slate-400 font-medium">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE/EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-600" />
                {modalType === "create" ? "Create New User" : "Edit User Details"}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Profile Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-3 py-2 bg-slate-50/50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-medium text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@company.com"
                    className="w-full px-3 py-2 bg-slate-50/50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-medium text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    {modalType === "create" ? "Password" : "New Password (Optional)"}
                  </label>
                  <input
                    type="password"
                    required={modalType === "create"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={modalType === "create" ? "••••••••" : "Leave blank to keep current"}
                    className="w-full px-3 py-2 bg-slate-50/50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-medium text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                    Role Profile
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50/50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-medium text-sm"
                  >
                    <option value="User">User (Access strictly restricted to permissions)</option>
                    <option value="Admin">Admin (Access only to company details)</option>
                    {currentUser.role === "Super Admin" && (
                      <option value="Super Admin">Super Admin (Access everything)</option>
                    )}
                  </select>
                </div>

                {currentUser.role === "Super Admin" && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                      Assign Company
                    </label>
                    <select
                      value={companyId}
                      onChange={(e) => setCompanyId(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-50/50 border border-slate-300 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-medium text-sm"
                    >
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center mt-6">
                  <label className="inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="relative w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    <span className="ms-3 text-sm font-semibold text-slate-700">Account Active</span>
                  </label>
                </div>
              </div>

              {/* Permissions Checklist (Hide if Role is Super Admin) */}
              {role !== "Super Admin" && (
                <div className="border-t border-slate-100 pt-6">
                  <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                    <Shield className="w-4.5 h-4.5 text-indigo-500" />
                    Permission Assignments
                  </h4>
                  <p className="text-slate-400 text-xs mb-4">
                    Check specific features this operator is allowed to access.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {ALL_PERMISSIONS.map((perm) => {
                      const isChecked = permissions.includes(perm.code);
                      return (
                        <div
                          key={perm.code}
                          onClick={() => handleTogglePermission(perm.code)}
                          className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer hover:bg-slate-50 transition-all ${
                            isChecked
                              ? "bg-indigo-50/35 border-indigo-200"
                              : "border-slate-200"
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                              isChecked
                                ? "bg-indigo-600 border-indigo-600 text-white"
                                : "border-slate-300"
                            }`}
                          >
                            {isChecked && <Check className="w-3.5 h-3.5 font-bold" />}
                          </div>
                          <span className="text-xs font-semibold text-slate-700">{perm.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition-all active:scale-[0.98] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-md shadow-indigo-600/10 transition-all active:scale-[0.98] cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
