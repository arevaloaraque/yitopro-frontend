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
import { acceptInvite as apiAcceptInvite } from "@/lib/api/invite";

/** Authenticated user (the minimum the shell needs). */
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
  /** Authenticates against the real backend (`POST /api/auth/login/`). */
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Rotates the session using the httpOnly cookie (`POST /api/auth/refresh/`). */
  refresh: () => Promise<boolean>;
  /** Accepts a staff invite, sets the token in memory, and loads the user identity. */
  acceptInvite: (token: string, password: string) => Promise<void>;
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
  // The access token lives ONLY in memory. Never localStorage/sessionStorage.
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  // While the silent boot refresh runs, the session is "loading".
  const [bootstrapped, setBootstrapped] = useState(false);

  // Ref so the HTTP client always reads the current token.
  const tokenRef = useRef<string | null>(null);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const { access_token } = await refreshRequest();
      // Sync the ref immediately: the interceptor retry reads
      // `tokenRef.current` right after this await, before React
      // re-renders and runs the effect that updates it.
      tokenRef.current = access_token;
      setToken(access_token);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Rebuilds the visible identity from the backend (`GET /api/auth/me/`).
  // Best-effort: on failure, `user` is left as-is (UserMenu falls back to "Operador").
  const loadUser = useCallback(async () => {
    try {
      const me = await getMe();
      setUser({ id: me.id, email: me.email, name: me.name });
    } catch {
      // no profile available
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (!email || !password) {
      throw new Error("Email y contraseña son obligatorios.");
    }
    const { access_token } = await loginRequest(email, password);
    // The JWE token is opaque: it is not decoded. The real identity comes from
    // GET /api/auth/me/; on failure, fall back to the name derived from the email.
    tokenRef.current = access_token;
    setToken(access_token);
    try {
      const me = await getMe();
      setUser({ id: me.id, email: me.email, name: me.name });
    } catch {
      setUser({ id: email, email, name: nameFromEmail(email) });
    }
  }, []);

  const acceptInvite = useCallback(
    async (token: string, password: string) => {
      const { access_token } = await apiAcceptInvite(token, password);
      tokenRef.current = access_token;
      setToken(access_token);
      try {
        const me = await getMe();
        setUser({ id: me.id, email: me.email, name: me.name });
      } catch {
        // identity will load later; session is established
      }
    },
    [],
  );

  const logout = useCallback(() => {
    // Best-effort: revokes the refresh token on the backend (uses the cookie).
    // Does not block local logout if the network fails.
    void logoutRequest().catch(() => {});
    tokenRef.current = null;
    setToken(null);
    setUser(null);
  }, []);

  // Session expired: clears the session (RequireAuth redirects to /login).
  const handleSessionExpired = useCallback(() => {
    setToken(null);
    setUser(null);
    // Force a react render so RequireAuth picks up the change
    // and redirects to /login automatically.
  }, []);

  // Registers the auth hooks on the HTTP client (only once).
  useEffect(() => {
    configureApiAuth({
      getAccessToken: () => tokenRef.current,
      refreshSession: refresh,
      onSessionExpired: handleSessionExpired,
    });
  }, [refresh, handleSessionExpired]);

  // Boot: tries to restore the session with the httpOnly refresh cookie.
  // If it works, rebuilds the identity. A timeout avoids getting stuck on the
  // splash if the backend doesn't respond; no matter what, "loading" ends.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), 10_000);
    });
    (async () => {
      // Single-flight: in dev, StrictMode mounts this effect twice. Without the
      // dedup, both calls present the same refresh token and rotation revokes
      // one → the backend deletes the cookie → logout on reload.
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
      acceptInvite,
    }),
    [user, token, bootstrapped, login, logout, refresh, acceptInvite],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
