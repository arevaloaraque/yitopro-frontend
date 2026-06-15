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

const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING === "enabled";

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
  /** En mock acepta cualquier credencial y setea un token falso. */
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Stub mock por ahora; F4 conecta el refresh real (cookie httpOnly). */
  refresh: () => Promise<boolean>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

let fakeTokenSeq = 0;

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
    // Stub: F4 hará POST de refresh usando la cookie httpOnly.
    return false;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (!email || !password) {
      throw new Error("Email y contraseña son obligatorios.");
    }
    if (MOCKING) {
      fakeTokenSeq += 1;
      // Token opaco simulado (no se decodifica en el cliente).
      const fakeToken = `mock.jwe.${btoa(email)}.${fakeTokenSeq}`;
      setToken(fakeToken);
      setUser({ id: `usr_${fakeTokenSeq}`, email, name: nameFromEmail(email) });
      return;
    }
    // F4 conectará el login real contra el backend. Por ahora, sin backend,
    // dejamos la sesión sin token (las llamadas reales fallarán con 401).
    throw new Error("Login real no implementado todavía (se conecta en F4).");
  }, []);

  const logout = useCallback(() => {
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
