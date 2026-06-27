"use client";

import { useRouter } from "next/navigation";

import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";

/** 404 global consistente — reutiliza el mismo componente visual de error. */
export default function NotFound() {
  const router = useRouter();
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-4">
      <ErrorState
        title="Página no encontrada"
        description="La página que buscas no existe o fue movida."
        action={
          <Button size="sm" onClick={() => router.push("/dashboard")}>
            Ir al inicio
          </Button>
        }
        className="max-w-md"
      />
    </main>
  );
}
