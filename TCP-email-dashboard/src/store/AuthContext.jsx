import React, { createContext, useState, useEffect, useContext } from "react";
import { loginUser, authMe, getTcpClientConfig } from "../api";
import api from "../api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]                   = useState(null);
  const [token, setToken]                 = useState(localStorage.getItem("token") || null);
  const [loading, setLoading]             = useState(true);
  const [tcpConfigured, setTcpConfigured] = useState(true);

  async function checkTcpConfig() {
    try {
      const cfg = await getTcpClientConfig();
      setTcpConfigured(cfg.configured);
    } catch {
      setTcpConfigured(true); // don't block on error
    }
  }

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const userData = await authMe();
          setUser(userData);
          await checkTcpConfig();
        } catch {
          logout();
        }
      }
      setLoading(false);
    };
    initAuth();
  }, [token]);

  const login = async (email, password) => {
    try {
      const response = await loginUser(email, password);
      if (response.success && response.token) {
        localStorage.setItem("token", response.token);
        setToken(response.token);
        setUser(response.user);
        // check TCP config and reconnect after login
        try {
          const cfg = await getTcpClientConfig();
          setTcpConfigured(cfg.configured);
          if (cfg.configured) {
            api.post("/tcp-client-config/reconnect").catch(() => {});
          }
        } catch {
          setTcpConfigured(true);
        }
        return { success: true };
      }
      return { success: false, message: response.message || "Login failed" };
    } catch (err) {
      return {
        success: false,
        message: err.response?.data?.message || err.message || "An error occurred during login",
      };
    }
  };

  const logout = () => {
    // Tell backend to stop TCP connections for this user before clearing token
    api.post("/tcp-client-config/disconnect").catch(() => {});
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  const can = (permission) => {
    if (!user) return false;
    if (user.role === "Super Admin") return true;
    return Array.isArray(user.permissions) && user.permissions.includes(permission);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, can, tcpConfigured, setTcpConfigured }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};
