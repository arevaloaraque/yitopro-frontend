"use client";

import { useContext } from "react";

import { AuthContext, type AuthContextValue } from "./AuthContext";

/** Access to the current session. Must be used inside `<AuthProvider>`. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de <AuthProvider>.");
  }
  return ctx;
}
