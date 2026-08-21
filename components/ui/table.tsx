"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Overflow affordance: fade on the right edge while columns are hidden past it.
  // Solo borde derecho (tablas LTR); agregar el izquierdo si algún día importa.
  const updateOverflow = React.useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller || !containerRef.current) return;
    containerRef.current.dataset.overflow = String(
      scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 1,
    );
  }, []);

  React.useEffect(() => {
    updateOverflow();
    const scroller = scrollRef.current;
    if (!scroller) return;
    const ro = new ResizeObserver(updateOverflow);
    ro.observe(scroller);
    if (scroller.firstElementChild) ro.observe(scroller.firstElementChild);
    return () => ro.disconnect();
  }, [updateOverflow]);

  return (
    <div
      ref={containerRef}
      data-slot="table-container"
      className="relative w-full rounded-2xl border-[1.5px] border-clay-line shadow-clay after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-8 after:rounded-r-2xl after:bg-gradient-to-l after:from-background after:opacity-0 after:transition-opacity data-[overflow=true]:after:opacity-100"
    >
      <div
        ref={scrollRef}
        onScroll={updateOverflow}
        className="w-full overflow-x-auto rounded-2xl"
      >
        <table
          data-slot="table"
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("bg-surface/80 [&_tr]:border-b", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border/50 transition-colors hover:bg-muted/40 has-aria-expanded:bg-muted/40 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-11 px-4 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-4 py-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableHead, TableRow, TableCell };
