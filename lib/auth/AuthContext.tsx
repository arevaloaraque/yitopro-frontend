"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { configureApiAuth } from "@/lib/api/client";
import { loginRequest, logoutRequest, refreshRequest } from "@/lib/api/auth";

/** Usuario autenticado (mínimo necesario para el shell). */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export type AuthStatus = "unauthenticated" | "authenticated";

export interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  /** Autentica contra el backend real (`POST /api/auth/login/`). */
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Rota la sesión usando la cookie httpOnly (`POST /api/auth/refresh/`). */
  refresh: () => Promise<boolean>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function nameFromEmail(email: string): string {
  const handle = email.split("@")[0] ?? "Operador";
  return handle
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // El access token vive SOLO en memoria. Nunca localStorage/sessionStorage.
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  // Ref para que el cliente HTTP lea siempre el token vigente.
  const tokenRef = useRef<string | null>(null);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const { access_token } = await refreshRequest();
      // Sincroniza el ref de inmediato: el reintento del interceptor lee
      // `tokenRef.current` justo tras este await, antes de que React
      // re-renderice y corra el effect que lo actualiza.
      tokenRef.current = access_token;
      setToken(access_token);
      return true;
    } catch {
      return false;
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (!email || !password) {
      throw new Error("Email y contraseña son obligatorios.");
    }
    const { access_token } = await loginRequest(email, password);
    // El backend no devuelve perfil (solo el token); la identidad visible se
    // arma con el email del formulario. El token JWE es opaco: no se decodifica.
    tokenRef.current = access_token;
    setToken(access_token);
    setUser({ id: email, email, name: nameFromEmail(email) });
  }, []);

  const logout = useCallback(() => {
    // Best-effort: revoca el refresh token en el backend (usa la cookie).
    // No bloquea el cierre de sesión local si la red falla.
    void logoutRequest().catch(() => {});
    tokenRef.current = null;
    setToken(null);
    setUser(null);
  }, []);

  // Session expired: limpia sesion (RequireAuth redirige a /login).
  const handleSessionExpired = useCallback(() => {
    setToken(null);
    setUser(null);
    // Force a react render so RequireAuth picks up the change
    // and redirects to /login automatically.
  }, []);

  // Registra los hooks de auth en el cliente HTTP (una sola vez).
  useEffect(() => {
    configureApiAuth({
      getAccessToken: () => tokenRef.current,
      refreshSession: refresh,
      onSessionExpired: handleSessionExpired,
    });
  }, [refresh, handleSessionExpired]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status: token ? "authenticated" : "unauthenticated",
      isAuthenticated: token !== null,
      login,
      logout,
      refresh,
    }),
    [user, token, login, logout, refresh],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
