"use client";

import { Bell, ChevronRight, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
    <>
      {/* The badge changes while the panel is CLOSED, and the trigger's aria-label is
          only announced on focus — so a screen-reader user was never told. */}
      <span className="sr-only" aria-live="polite">
        {unreadCount === 0
          ? ""
          : unreadCount === 1
            ? "1 notificación sin leer"
            : `${unreadCount} notificaciones sin leer`}
      </span>
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

        {/* Everything in here is a DropdownMenuItem on purpose: the popup carries
            role="menu", which may only own menuitem/group/separator. It used to hold a
            raw <button> and a <ul><li><a> — invalid ARIA, and since Base UI saw zero
            composite items the arrow keys had nothing to move through (review
            2026-07-27). */}
        <DropdownMenuContent align="end" className="w-80 p-0">
          {/* Wrapped in a Group, which is NOT decoration: Base UI's GroupLabel reads its
              group context non-optionally and THROWS without it — a bare
              DropdownMenuLabel here took the whole page down on every open, because the
              bell is mounted in the authenticated layout. Same pattern as
              components/layout/user-menu.tsx (review 2026-07-27, round 3). */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex items-center justify-between border-b border-border px-3 py-2 font-semibold">
              Notificaciones
              {notifications.length > 0 ? (
                <span className="text-xs font-normal text-muted-foreground">
                  {notifications.length} reciente(s)
                </span>
              ) : null}
            </DropdownMenuLabel>
          </DropdownMenuGroup>

          {notifications.length === 0 ? (
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-3 py-8 text-center text-sm font-normal text-muted-foreground">
                Sin notificaciones por ahora.
              </DropdownMenuLabel>
            </DropdownMenuGroup>
          ) : (
            <DropdownMenuGroup className="block max-h-80 divide-y divide-border overflow-y-auto">
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

                // Navigable when the event points somewhere: the operator sees "Nuevo
                // mensaje" and lands on THAT conversation instead of hunting for it in the
                // inbox. When it points nowhere the row is inert rather than fake-clickable.
                return n.href ? (
                  <DropdownMenuItem
                    key={n.id}
                    render={<Link href={n.href} />}
                    className="flex w-full gap-2.5 rounded-none px-3 py-2.5 text-left"
                  >
                    {body}
                    <ChevronRight
                      aria-hidden="true"
                      className="mt-1 size-3.5 shrink-0 self-start text-muted-foreground"
                    />
                  </DropdownMenuItem>
                ) : (
                  // `disabled` is the honest state for a row with nothing to activate
                  // (only the two error events have no destination) — a plain menuitem
                  // would announce as actionable and do nothing. The de-dim must be the
                  // SAME variant to win: Tailwind v4 wraps both in `:where()`, so all three
                  // candidates are (0,1,0) and SOURCE ORDER decides — a plain `opacity-100`
                  // sorts before the base `data-disabled:opacity-50` and was dead code, so
                  // the rows rendered at half opacity and announced as disabled.
                  <DropdownMenuItem
                    key={n.id}
                    disabled
                    className="flex gap-2.5 rounded-none px-3 py-2.5 data-disabled:opacity-100"
                  >
                    {body}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          )}

          {notifications.length > 0 ? <DropdownMenuSeparator className="my-0" /> : null}
          {/* The sound switch belongs HERE, next to what makes noise — not only in
              Configuración, where nobody looks while a beep is annoying them.
              A CheckboxItem, not an Item with aria-pressed: ARIA allows aria-pressed only
              on role="button", and this row is a menuitem — screen readers dropped the
              state entirely. CheckboxItem renders aria-checked and already defaults to
              closeOnClick={false}, which is also what keeps the panel open (the
              preventDefault() this replaced was a no-op on a plain button).
              The name is FIXED and `checked` means "sound on": a label that flips with the
              state made aria-checked and the accessible name contradict each other, which
              is worse than round 1's missing state — a wrong state reads as authoritative
              (review 2026-07-27, round 3). Same polarity as the settings card. */}
          <DropdownMenuCheckboxItem
            checked={!soundMuted}
            onCheckedChange={toggleSound}
            className="gap-2 rounded-none px-3 py-2.5 pr-8 text-xs"
          >
            {soundMuted ? (
              <VolumeX className="size-4 text-muted-foreground" />
            ) : (
              <Volume2 className="size-4" />
            )}
            Avisos con sonido
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
