"use client";

import { ThemeProvider } from "next-themes";

import { AuthProvider } from "@/lib/auth";

/**
 * Providers globales del cliente: tema (next-themes) + sesión (AuthProvider,
 * token en memoria). El backend real es la única fuente de datos; ya no hay MSW
 * en runtime (los tests usan `mocks/server.ts` aparte).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
}
