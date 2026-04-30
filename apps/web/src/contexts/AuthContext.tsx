import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { api, clearToken, setToken, getToken } from "../api/client";

interface User {
  id: string;
  email: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  const loadUser = useCallback(async () => {
    if (!getToken()) {
      setState({ user: null, loading: false });
      return;
    }
    try {
      const { id, email } = await api.me();
      setState({ user: { id, email }, loading: false });
    } catch {
      clearToken();
      setState({ user: null, loading: false });
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const login = async (email: string, password: string) => {
    const { token } = await api.login(email, password);
    setToken(token);
    const { id } = await api.me();
    setState({ user: { id, email }, loading: false });
  };

  const register = async (email: string, password: string) => {
    const { token } = await api.register(email, password);
    setToken(token);
    setState({ user: { id: "", email }, loading: false });
    const { id } = await api.me();
    setState({ user: { id, email }, loading: false });
  };

  const logout = () => {
    clearToken();
    setState({ user: null, loading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
