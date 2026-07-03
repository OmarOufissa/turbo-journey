import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthUser, LoginResponse } from "@shared/api";
import { apiPost, getToken, setToken, clearToken } from "./api";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function decodeUserFromToken(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return { id: payload.id, username: payload.username, nom: payload.nom, agentId: payload.agentId };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (token) setUser(decodeUserFromToken(token));
    setLoading(false);
  }, []);

  async function login(username: string, password: string) {
    const res = await apiPost<LoginResponse>("/auth/login", { username, password });
    setToken(res.token);
    setUser(res.user);
  }

  function logout() {
    clearToken();
    setUser(null);
    location.href = "/login";
  }

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
