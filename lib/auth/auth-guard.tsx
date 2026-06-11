"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

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
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, redirectTo, router]);

  if (!isAuthenticated) return null;
  return <>{children}</>;
}
