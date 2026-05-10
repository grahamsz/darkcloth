import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { api, clearToken, setToken, getToken } from "../api/client";
import type { User } from "../api/client";

const USER_CACHE_KEY = "pt_user";

interface AuthState {
  user: User | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<User | null>;
  replaceUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<User>;
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.email !== "string") return null;
    return {
      id: parsed.id,
      email: parsed.email,
      email_verified_at: typeof parsed.email_verified_at === "string" ? parsed.email_verified_at : null,
      default_timezone: typeof parsed.default_timezone === "string" ? parsed.default_timezone : null,
      auto_use_current_location: parsed.auto_use_current_location === true,
      created_at: typeof parsed.created_at === "string" ? parsed.created_at : "",
      updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : "",
    };
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null) {
  try {
    if (user) {
      localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_CACHE_KEY);
    }
  } catch {
    // Auth still works without local profile persistence.
  }
}

function isUnauthorized(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "status" in error
    && ((error as { status?: unknown }).status === 401 || (error as { status?: unknown }).status === 403);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  const replaceUser = useCallback((user: User | null) => {
    writeCachedUser(user);
    setState({ user, loading: false });
  }, []);

  const refreshUser = useCallback(async () => {
    if (!getToken()) {
      replaceUser(null);
      return null;
    }

    try {
      const user = await api.me();
      replaceUser(user);
      return user;
    } catch (error) {
      if (isUnauthorized(error)) {
        clearToken();
        replaceUser(null);
        return null;
      }

      const cachedUser = readCachedUser();
      if (cachedUser) {
        setState({ user: cachedUser, loading: false });
        return cachedUser;
      }

      setState({ user: null, loading: false });
      return null;
    }
  }, [replaceUser]);

  useEffect(() => {
    void refreshUser();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const { token, user } = await api.login(email, password);
    setToken(token);
    replaceUser(user);
  };

  const register = async (email: string, password: string) => {
    const { token, user } = await api.register(email, password);
    setToken(token);
    replaceUser(user);
  };

  const logout = () => {
    clearToken();
    writeCachedUser(null);
    replaceUser(null);
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, refreshUser, replaceUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
