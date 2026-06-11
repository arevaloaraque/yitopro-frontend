"use client";

import { useContext } from "react";

import { AuthContext, type AuthContextValue } from "./AuthContext";

/** Acceso a la sesión actual. Debe usarse dentro de `<AuthProvider>`. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de <AuthProvider>.");
  }
  return ctx;
}
