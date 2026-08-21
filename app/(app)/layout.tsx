"use client";

import { PlanGate } from "@/components/layout/plan-gate";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AgentsProvider } from "@/lib/agents";
import { RequireAuth } from "@/lib/auth";
import { BusinessProvider } from "@/lib/business";
import { NotificationsProvider } from "@/lib/notifications";
import { OrdersProvider } from "@/lib/orders";

/**
 * Authenticated layout that wraps all internal screens.
 * - Guard: redirects to /login when there is no session.
 * - SSE: `NotificationsProvider` opens the subscription ONCE here.
 * - Agents: `AgentsProvider` holds the shared agent state so the topbar badge
 *   and the Agents page stay in sync (toggling an agent updates the badge live).
 * - Business: `BusinessProvider` holds the shared business/assistant state so
 *   the topbar badge and the Settings page stay in sync (saving a setting
 *   updates the badge live).
 * - Orders: `OrdersProvider` holds the pending-draft-orders count so the
 *   "Pedidos" sidebar badge and the Pedidos page stay in sync.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <NotificationsProvider>
        <AgentsProvider>
          <BusinessProvider>
            <OrdersProvider>
              <PlanGate>
              <div className="flex min-h-svh bg-surface">
                <Sidebar />
                <div className="flex min-w-0 flex-1 flex-col">
                  <Topbar />
                  {/* Sin max-w: los módulos van a ancho completo y el único
                      espacio lateral es este padding. Un tope aquí volvía a
                      dibujar franjas vacías en monitores anchos. */}
                  <main className="flex w-full flex-1 flex-col px-6 py-8 md:px-12 md:py-12">
                    {children}
                  </main>
                </div>
              </div>
              </PlanGate>
            </OrdersProvider>
          </BusinessProvider>
        </AgentsProvider>
      </NotificationsProvider>
    </RequireAuth>
  );
}
