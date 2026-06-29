"use client";

import { Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { AssistantStatus } from "./assistant-status";
import { NotificationBell } from "./notification-bell";
import { SidebarBrand } from "./sidebar-brand";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

/**
 * Top bar: mobile navigation (sheet), assistant status, notification bell and
 * user menu.
 */
export function Topbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b-[1.5px] border-clay-line/70 bg-background px-4 md:px-6">
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Abrir menú"
            />
          }
        >
          <Menu />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 max-w-[80vw] p-0">
          <SheetHeader className="h-16 justify-center border-b border-sidebar-border">
            <SheetTitle>
              <SidebarBrand />
            </SheetTitle>
          </SheetHeader>
          <SidebarNav onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
        <AssistantStatus />
        <ThemeToggle />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
