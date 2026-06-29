"use client";

import { ThemeProvider } from "next-themes";

import { AuthProvider } from "@/lib/auth";

/**
 * Global client providers: theme (next-themes) + session (AuthProvider,
 * in-memory token). The real backend is the single source of data; there is no
 * longer MSW at runtime (tests use `mocks/server.ts` separately).
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
