"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { BootSplash } from "@/components/states";

import { useAuth } from "./useAuth";

interface RequireAuthProps {
  children: React.ReactNode;
  /** Ruta a la que redirigir si no hay sesión. */
  redirectTo?: string;
}

/**
 * Guard de sesión: redirige a `/login` si no hay sesión.
 * Se cableará en el layout autenticado en F2-A.
 */
export function RequireAuth({ children, redirectTo = "/login" }: RequireAuthProps) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Solo redirige cuando el arranque ya descartó la sesión. Durante "loading"
    // (refresh silencioso en curso) espera, para no rebotar a /login.
    if (status === "unauthenticated") {
      router.replace(redirectTo);
    }
  }, [status, redirectTo, router]);

  if (status === "loading") return <BootSplash />;
  if (status !== "authenticated") return null;
  return <>{children}</>;
}
