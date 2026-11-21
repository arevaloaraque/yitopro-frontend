"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/lib/auth";
import { useBusinessOptional } from "@/lib/business/business-context";
import { usePendingOrders } from "@/lib/orders";
import { cn } from "@/lib/utils";

import { NAV_ITEMS } from "./nav-items";

interface SidebarNavProps {
  collapsed?: boolean;
  /** Called on navigation (e.g. to close the mobile sheet). */
  onNavigate?: () => void;
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const { pendingCount } = usePendingOrders();
  const { user } = useAuth();
  // Oculta los ítems ownerOnly SOLO a una sesión staff confirmada. Con el rol
  // ausente (el fallback sin rol del login) se muestran: esconderlos ahí le
  // haría perder Reportes al dueño de forma intermitente, y la seguridad real
  // es el 403 del backend, no este filtro.
  // Igual criterio para el plan: se oculta solo ante un `false` explícito. Si el
  // negocio todavía no cargó, se muestra — hacerlo al revés haría parpadear el
  // menú en cada carga, y quien manda es el 403 del backend.
  const business = useBusinessOptional()?.business ?? null;
  const hasAssistant = business?.entitlements?.assistant !== false;
  const items = NAV_ITEMS.filter(
    (item) =>
      !(user?.role === "staff" && item.ownerOnly) &&
      !(item.requiresAssistant && !hasAssistant),
  );

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-5">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;
        // Only "Pedidos" carries a badge: the number of drafts awaiting action.
        const badgeCount = item.href === "/orders" ? pendingCount : 0;

        const linkClass = cn(
          "group relative flex cursor-pointer items-center text-[0.8rem] font-medium transition-all duration-200 ease-out",
          collapsed ? "h-9 w-9 justify-center" : "gap-3 px-3 py-2.5",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
            : "rounded-lg text-sidebar-foreground/55 hover:bg-sidebar-accent/30 hover:text-sidebar-foreground",
        );

        if (collapsed) {
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger
                render={
                  <Link
                    href={item.href}
                    aria-label={
                      badgeCount > 0
                        ? `${item.label}, ${badgeCount} pendientes`
                        : item.label
                    }
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(linkClass, "rounded-lg")}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {badgeCount > 0 && (
                      <span
                        className="absolute top-1 right-1 size-2 rounded-full bg-warning"
                        aria-hidden="true"
                      />
                    )}
                  </Link>
                }
              />
              <TooltipContent side="right">
                {badgeCount > 0 ? `${item.label} (${badgeCount})` : item.label}
              </TooltipContent>
            </Tooltip>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={
              badgeCount > 0 ? `${item.label}, ${badgeCount} pendientes` : undefined
            }
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(linkClass, "rounded-lg")}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
            {badgeCount > 0 && (
              <Badge
                variant="warning"
                className="ml-auto h-5 min-w-5 justify-center px-1.5 tabular-nums"
              >
                {badgeCount}
              </Badge>
            )}
            {active ? (
              <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-accent-foreground" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
