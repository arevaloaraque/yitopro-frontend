"use client";

import type React from "react";
import Link from "next/link";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

interface NotificationToastProps {
  title: string;
  description?: string;
  /** Destino del aviso. Sin él la tarjeta no es navegable (los errores no van a ninguna parte). */
  href?: string;
  /** El distintivo circular del dominio, ya construido. */
  badge: React.ReactNode;
  /** Un error se tiene que leer distinto de un aviso corriente. */
  tone?: "default" | "error";
  onClose: () => void;
}

/**
 * La tarjeta de un aviso. **Toda la caja es el enlace**, no un botón «Ver» dentro.
 *
 * Ese botón fue tres intentos de alineación fallidos: cualquier posición que le diéramos se
 * leía distinta entre cajas, porque el toast no tiene alto fijo. Con la tarjeta entera
 * navegable no hay nada que alinear, el área de click es enorme y sobra el «Ver».
 *
 * Se dibuja con `toast.custom`, así que el markup es nuestro. Eso saca del medio la pelea con
 * la hoja de sonner —que inyecta sus reglas en runtime y ganaba por orden de cascada— y con
 * ella los parches que hacían falta para vencerla.
 *
 * El botón de cerrar es HERMANO del enlace, no hijo: un botón dentro de un `<a>` es un
 * control anidado, y así además cerrar no dispara la navegación.
 */
export function NotificationToast({
  title,
  description,
  href,
  badge,
  tone = "default",
  onClose,
}: NotificationToastProps) {
  const card = (
    <div
      className={cn(
        // `min-h`: todas las tarjetas miden lo mismo, con el alto del aviso más largo (una
        // descripción de dos líneas), así ninguna recorta texto y la pila se lee como una
        // columna. Es `min-h` y no `h` para que un mensaje futuro más largo crezca.
        "flex min-h-[5.75rem] w-full items-center gap-3 rounded-2xl border-[1.5px] bg-popover p-4 text-popover-foreground shadow-clay-lg transition-colors",
        tone === "error" ? "border-destructive/30" : "border-clay-line",
      )}
    >
      {badge}
      <div className="min-w-0 flex-1">
        <p className="font-heading text-sm leading-snug font-medium">{title}</p>
        {description ? (
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="relative w-[356px] max-w-[calc(100vw-2rem)]">
      {href ? (
        <Link
          href={href}
          onClick={onClose}
          // `hover:[&>div]:` es `&:hover > div` (iluminar la tarjeta al pasar por el enlace);
          // al revés, `[&>div]:hover:`, sería `& > div:hover`, que es otra cosa.
          className="block rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 hover:[&>div]:bg-surface"
        >
          {card}
        </Link>
      ) : (
        card
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar aviso"
        className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full border border-border bg-popover text-muted-foreground shadow-clay outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
