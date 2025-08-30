import React, { useEffect, useState } from "react";
import { AuthContext } from "./context";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!res.ok) {
          if (mounted) setUser(null);
          return;
        }
        const data = await res.json().catch(() => null);
        if (mounted) setUser(data?.user || null);
      } catch {
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => (mounted = false);
  }, []);

  // Perform login network request and update context on success
  const login = async (email, password) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setUser(data?.user || null);
        return { ok: true, user: data?.user || null };
      }
      return { ok: false, errors: data?.errors || [{ message: "登录失败" }] };
    } catch (err) {
      return { ok: false, errors: [{ message: String(err) }] };
    }
  };

  // Perform register network request and update context on success
  const register = async (email, password, name) => {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok || res.status === 201) {
        setUser(data?.user || null);
        return { ok: true, user: data?.user || null };
      }
      return { ok: false, errors: data?.errors || [{ message: "注册失败" }] };
    } catch (err) {
      return { ok: false, errors: [{ message: String(err) }] };
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Note: no default export to keep module exports limited to React components/hooks for fast refresh
