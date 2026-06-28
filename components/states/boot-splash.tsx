import { Loader2 } from "lucide-react";

/**
 * Pantalla de carga a pantalla completa durante el arranque, mientras el
 * `AuthProvider` intenta restaurar la sesión con la cookie httpOnly de refresh.
 * Evita el parpadeo del formulario de login y el rebote a `/login`.
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
