"use client";

import { ThemeProvider } from "next-themes";
import { useEffect, useState } from "react";

import { AuthProvider } from "@/lib/auth";

const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING === "enabled";

/**
 * Providers globales del cliente. Arranca MSW (solo en modo mock) antes de
 * renderizar, para que ninguna llamada se escape sin interceptar, y monta el
 * `AuthProvider` (token en memoria).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // Si no hay mock, no hay nada que esperar.
  const [mswReady, setMswReady] = useState(!MOCKING);

  useEffect(() => {
    if (!MOCKING) return;
    let active = true;
    (async () => {
      try {
        const { startMockWorker } = await import("@/mocks/browser");
        await startMockWorker();
      } catch (error) {
        console.error("[MSW] No se pudo iniciar el worker mock:", error);
      } finally {
        // Renderizamos igual: un fallo del worker no debe bloquear la app.
        if (active) setMswReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {mswReady ? <AuthProvider>{children}</AuthProvider> : null}
    </ThemeProvider>
  );
}
