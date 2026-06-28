"use client";

import { PanelLeft, PanelLeftClose } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { SidebarBrand } from "./sidebar-brand";
import { SidebarNav } from "./sidebar-nav";

/**
 * Barra lateral fija de escritorio. Colapsable: alterna entre logo horizontal
 * (expandida) e isotipo (colapsada). Oculta en móvil — ahí se usa el sheet del
 * topbar.
 */
export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r-[1.5px] border-clay-line/70 bg-sidebar transition-all duration-300 ease-in-out md:flex",
        collapsed ? "w-[4.5rem]" : "w-[16.5rem]",
      )}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-sidebar-border/40",
          collapsed ? "justify-center px-3" : "justify-between px-5",
        )}
      >
        <SidebarBrand collapsed={collapsed} />
        {!collapsed ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed(true)}
            aria-label="Colapsar menú"
            className="cursor-pointer"
          >
            <PanelLeftClose className="size-4" />
          </Button>
        ) : null}
      </div>

      {collapsed ? (
        <div className="flex justify-center px-3 pt-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed(false)}
            aria-label="Expandir menú"
            className="cursor-pointer"
          >
            <PanelLeft className="size-4" />
          </Button>
        </div>
      ) : null}

      <SidebarNav collapsed={collapsed} />
    </aside>
  );
}
