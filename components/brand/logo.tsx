import { cn } from "@/lib/utils";

/**
 * Yitopro brand: "orbit" symbol (open arc + core) + wordmark, inline and
 * theme-adaptive. The symbol uses color tokens (stroke-primary / fill-accent),
 * so it lightens automatically in dark mode like the rest of the UI — no file
 * swapping or flash. The wordmark is real text in the headings font (Fredoka)
 * with text-foreground: navy in light, off-white in dark. No hex literals.
 */

/** The symbol only (orbit). Transparent; size is inherited via className. */
export function BrandMark({
  className,
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": "Yitopro" })}
    >
      <circle
        cx="32"
        cy="32"
        r="20"
        className="stroke-primary"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray="104 60"
        transform="rotate(-58 32 32)"
      />
      <circle cx="32" cy="32" r="8" className="fill-accent" />
    </svg>
  );
}

/**
 * Horizontal logo (symbol + wordmark). The size is controlled via the
 * container's font-size (e.g. className="text-[21px]").
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.32em] text-foreground",
        className,
      )}
    >
      <BrandMark className="h-[1.15em] w-[1.15em] shrink-0" decorative />
      <span className="font-heading font-semibold leading-none tracking-[-0.02em]">
        Yitopro
      </span>
    </span>
  );
}
