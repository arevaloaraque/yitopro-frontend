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
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
        collapsed ? "w-[4.5rem]" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        <SidebarBrand collapsed={collapsed} />
        {!collapsed ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed(true)}
            aria-label="Colapsar menú"
          >
            <PanelLeftClose />
          </Button>
        ) : null}
      </div>

      {collapsed ? (
        <div className="flex justify-center px-2 pt-2">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed(false)}
            aria-label="Expandir menú"
          >
            <PanelLeft />
          </Button>
        </div>
      ) : null}

      <SidebarNav collapsed={collapsed} />
    </aside>
  );
}
