import { cn } from "@/lib/utils";

/**
 * Marca Yitopro: símbolo "órbita" (arco abierto + núcleo) + wordmark, inline y
 * theme-adaptive. El símbolo usa tokens de color (stroke-primary / fill-accent),
 * así que se aclara solo en modo oscuro como el resto del UI — sin swap de
 * archivos ni flash. El wordmark es texto real en la fuente de títulos (Fredoka)
 * con text-foreground: navy en claro, off-white en oscuro. Sin hex literales.
 */

/** Solo el símbolo (órbita). Transparente; el tamaño se hereda vía className. */
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
 * Logo horizontal (símbolo + wordmark). El tamaño se controla con la font-size
 * del contenedor (p. ej. className="text-[21px]").
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
