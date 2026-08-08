import * as React from "react";

import { cn } from "@/lib/utils";

function Card({
  className,
  size = "default",
  elevated = false,
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm"; elevated?: boolean }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-2xl border-[1.5px] border-clay-line bg-card py-(--card-spacing) text-sm text-card-foreground shadow-clay [--card-spacing:--spacing(6)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(5)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-2xl *:[img:last-child]:rounded-b-2xl",
        elevated && "shadow-clay-lg",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1.5 rounded-t-2xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A card's title is a HEADING, so it renders as one: it was a plain `<div>`, which
 * looked identical and exposed nothing to the accessibility tree — a screen reader
 * found no heading at all on a page whose only title is a CardTitle (e.g.
 * /reset-password's "Crea una nueva contraseña"), and `getByRole("heading")` could
 * never match it (QA 2026-07-30).
 *
 * `as` lets a caller pick the right level for its document outline. `h2` is the default
 * because a card normally sits under the page's `h1` — `h3` skipped a level on every
 * screen that has no section heading in between (axe `heading-order`). `h1` is in the
 * union for the auth and onboarding screens, where the CardTitle is the page's ONLY
 * heading and no other element can carry the top level.
 */
function CardTitle({
  className,
  as: Tag = "h2",
  ...props
}: React.ComponentProps<"h3"> & { as?: "h1" | "h2" | "h3" | "h4" }) {
  return (
    <Tag
      data-slot="card-title"
      className={cn(
        "font-heading text-sm leading-tight font-semibold group-data-[size=sm]/card:text-[0.8rem]",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-[0.8rem] leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing) has-data-[slot=card-footer]:pb-0", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center rounded-b-2xl border-t border-border/40 bg-surface p-(--card-spacing)",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
