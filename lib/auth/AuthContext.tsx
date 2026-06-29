"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { configureApiAuth, refreshAuthOnce } from "@/lib/api/client";
import {
  getMe,
  loginRequest,
  logoutRequest,
  refreshRequest,
} from "@/lib/api/auth";

/** Usuario autenticado (mínimo necesario para el shell). */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export type AuthStatus = "loading" | "unauthenticated" | "authenticated";

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
  // Mientras corre el refresh silencioso de arranque, la sesión está "loading".
  const [bootstrapped, setBootstrapped] = useState(false);

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

  // Reconstruye la identidad visible desde el backend (`GET /api/auth/me/`).
  // Best-effort: si falla, se deja el `user` como esté (UserMenu cae a "Operador").
  const loadUser = useCallback(async () => {
    try {
      const me = await getMe();
      setUser({ id: me.id, email: me.email, name: me.name });
    } catch {
      // sin perfil disponible
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (!email || !password) {
      throw new Error("Email y contraseña son obligatorios.");
    }
    const { access_token } = await loginRequest(email, password);
    // El token JWE es opaco: no se decodifica. La identidad real se obtiene de
    // GET /api/auth/me/; si falla, se cae al nombre derivado del email.
    tokenRef.current = access_token;
    setToken(access_token);
    try {
      const me = await getMe();
      setUser({ id: me.id, email: me.email, name: me.name });
    } catch {
      setUser({ id: email, email, name: nameFromEmail(email) });
    }
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

  // Arranque: intenta restaurar la sesión con la cookie httpOnly de refresh.
  // Si funciona, reconstruye la identidad. Un timeout evita quedar atrapado en
  // el splash si el backend no responde; pase lo que pase, termina el "loading".
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), 10_000);
    });
    (async () => {
      // Single-flight: en dev, StrictMode monta este effect dos veces. Sin el
      // dedup, las dos llamadas presentan el mismo refresh token y la rotación
      // revoca uno → el backend borra la cookie → logout al recargar.
      const ok = await Promise.race([refreshAuthOnce(), timeout]);
      clearTimeout(timer);
      if (ok && active) await loadUser();
      if (active) setBootstrapped(true);
    })();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [refresh, loadUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status: !bootstrapped
        ? "loading"
        : token
          ? "authenticated"
          : "unauthenticated",
      isAuthenticated: token !== null,
      login,
      logout,
      refresh,
    }),
    [user, token, bootstrapped, login, logout, refresh],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
