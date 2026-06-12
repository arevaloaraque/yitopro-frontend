"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { RequireAuth } from "@/lib/auth";
import { NotificationsProvider } from "@/lib/notifications";

/**
 * Layout autenticado que envuelve todas las pantallas internas.
 * - Guard: sin sesión redirige a /login.
 * - SSE: `NotificationsProvider` abre la suscripción UNA sola vez aquí.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <NotificationsProvider>
        <div className="flex min-h-svh bg-background">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
          </div>
        </div>
      </NotificationsProvider>
    </RequireAuth>
  );
}
