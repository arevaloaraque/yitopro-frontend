"use client";

import { Bell, ChevronRight, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotifications, type NotificationTone } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const DOT_BY_TONE: Record<NotificationTone, string> = {
  default: "bg-primary",
  accent: "bg-accent",
  error: "bg-destructive",
};

function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "ahora";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

/** Topbar bell: unread count + panel with the latest notifications. */
export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, soundMuted, toggleSound } =
    useNotifications();

  return (
    <DropdownMenu onOpenChange={(open) => open && markAllRead()}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              unreadCount > 0
                ? `Notificaciones, ${unreadCount} sin leer`
                : "Notificaciones"
            }
            className="relative"
          />
        }
      >
        <Bell />
        {unreadCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground tabular-nums">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-semibold text-foreground">Notificaciones</span>
          <div className="flex items-center gap-1.5">
            {notifications.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {notifications.length} reciente(s)
              </span>
            ) : null}
            {/* The sound switch belongs HERE, next to what makes noise — not buried
                in Configuración, where nobody looks while a beep is annoying them. */}
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label={soundMuted ? "Activar sonido de notificaciones" : "Silenciar notificaciones"}
              aria-pressed={soundMuted}
              onClick={(event) => {
                event.preventDefault(); // keep the panel open
                toggleSound();
              }}
            >
              {soundMuted ? (
                <VolumeX className="size-4 text-muted-foreground" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </Button>
          </div>
        </div>

        {notifications.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Sin notificaciones por ahora.
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {notifications.map((n) => {
              const body = (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      DOT_BY_TONE[n.tone],
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          n.tone === "error" ? "text-destructive" : "text-foreground",
                        )}
                      >
                        {n.title}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {timeAgo(n.at)}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {n.description}
                    </p>
                  </div>
                </>
              );

              return (
                <li key={n.id}>
                  {/* Navigable when the event points somewhere: the operator sees
                      "Nuevo mensaje" and lands on THAT conversation, instead of
                      hunting for it in the inbox. */}
                  {n.href ? (
                    <Link
                      href={n.href}
                      className="flex w-full gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    >
                      {body}
                      <ChevronRight
                        aria-hidden="true"
                        className="mt-1 size-3.5 shrink-0 self-start text-muted-foreground"
                      />
                    </Link>
                  ) : (
                    <div className="flex gap-2.5 px-3 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
