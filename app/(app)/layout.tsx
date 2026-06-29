"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { RequireAuth } from "@/lib/auth";
import { NotificationsProvider } from "@/lib/notifications";

/**
 * Authenticated layout that wraps all internal screens.
 * - Guard: redirects to /login when there is no session.
 * - SSE: `NotificationsProvider` opens the subscription ONCE here.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <NotificationsProvider>
        <div className="flex min-h-svh bg-surface">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col px-6 py-8 md:px-12 md:py-12">
              {children}
            </main>
          </div>
        </div>
      </NotificationsProvider>
    </RequireAuth>
  );
}
