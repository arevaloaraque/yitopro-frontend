"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { NAV_ITEMS } from "./nav-items";

interface SidebarNavProps {
  collapsed?: boolean;
  /** Se llama al navegar (p.ej. para cerrar el sheet móvil). */
  onNavigate?: () => void;
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-0.5 px-3 py-5">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        const Icon = item.icon;

        const linkClass = cn(
          "group relative flex cursor-pointer items-center text-[0.8rem] font-medium transition-all duration-200 ease-out",
          collapsed ? "h-9 w-9 justify-center" : "gap-3 px-3 py-2.5",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
            : "text-sidebar-foreground/55 rounded-lg hover:bg-sidebar-accent/30 hover:text-sidebar-foreground",
        );

        if (collapsed) {
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger
                render={
                  <Link
                    href={item.href}
                    aria-label={item.label}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(linkClass, "rounded-lg")}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                  </Link>
                }
              />
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(linkClass, "rounded-lg")}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
            {active ? (
              <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-accent-foreground" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
