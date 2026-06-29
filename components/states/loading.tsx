import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface LoadingProps {
  /** Number of skeleton rows to render. */
  rows?: number;
  className?: string;
  /** Accessible text for screen readers. */
  label?: string;
}

/**
 * Reusable skeleton-based loading state.
 * Use it on any screen while data is being resolved.
 */
export function Loading({ rows = 4, className, label = "Cargando…" }: LoadingProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cn("w-full space-y-3", className)}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border/60 bg-surface/30 px-4 py-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
