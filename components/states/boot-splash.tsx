import { Loader2 } from "lucide-react";

/**
 * Full-screen loading screen during startup, while the `AuthProvider` tries to
 * restore the session using the httpOnly refresh cookie. Prevents the login
 * form from flickering and the bounce back to `/login`.
 */
export function BootSplash() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="flex min-h-svh items-center justify-center bg-surface"
    >
      <span className="sr-only">Cargando…</span>
      <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
    </div>
  );
}
