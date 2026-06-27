"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { messageForStatus, titleForStatus } from "@/lib/errors";

/**
 * Error boundary de ruta. Captura excepciones no manejadas (incluido un
 * `ApiError` lanzado en render) y muestra SIEMPRE un mensaje seguro — nunca el
 * stack ni el detalle técnico. `reset()` reintenta el render.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string; status?: number };
  reset: () => void;
}) {
  const router = useRouter();
  const status = typeof error.status === "number" ? error.status : undefined;

  useEffect(() => {
    // Observabilidad mínima (no se muestra nada de esto al usuario).
    console.error("[route-error]", error.digest ?? error.name);
  }, [error]);

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <ErrorState
        title={status ? titleForStatus(status) : "Algo salió mal"}
        description={
          status
            ? messageForStatus(status)
            : "Ocurrió un error inesperado. Inténtalo de nuevo."
        }
        onRetry={reset}
        action={
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard")}>
            Ir al inicio
          </Button>
        }
        className="max-w-md"
      />
    </main>
  );
}
