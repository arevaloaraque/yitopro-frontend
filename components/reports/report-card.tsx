"use client";

import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * La ÚNICA anatomía de tarjeta de `/reports`.
 *
 * Existe por una medición: las siete tarjetas de bloque tenían cuatro cabeceras
 * de alto distinto, así que el contenido arrancaba en cuatro offsets diferentes
 * (89 / 109 / 127 / 135 px). En una misma fila eso son tres gráficos que
 * empiezan a tres alturas: los pies cuadraban y aun así la fila se leía
 * desordenada. Tres de siete tenían subtítulo, seis de siete icono, y una traía
 * un desplegable donde las demás tenían el icono.
 *
 * De ahí las reglas, que son estructura y no estilo:
 *
 * 1. **El subtítulo es OBLIGATORIO y de una línea.** No es decoración: es lo
 *    que hace que la cabecera mida lo mismo en todas y el contenido arranque a
 *    la misma altura. Si una tarjeta no tiene nada que explicar, no necesita ser
 *    una tarjeta de bloque.
 * 2. **El icono va SIEMPRE**, arriba a la derecha, en la misma caja. Ningún
 *    control ocupa su sitio — un filtro va dentro del contenido, donde se ve que
 *    pertenece a los datos y no al título.
 * 3. **El pie es opcional pero se ancla abajo** (`mt-auto`): con las filas
 *    estiradas, sin eso cada enlace caería donde lo dejara el largo de su propio
 *    contenido.
 */
export function ReportCard({
  title,
  subtitle,
  icon: Icon,
  link,
  children,
  className,
  contentClassName,
}: {
  title: string;
  /** Una línea. Obligatorio: es lo que iguala el alto de las cabeceras. */
  subtitle: string;
  icon: LucideIcon;
  /** Solo si esa pantalla profundiza DE VERDAD estos datos. */
  link?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    // El `gap` del sistema entre cabecera y contenido se respeta: con `gap-0`
    // el número grande quedaba pegado al subtítulo en cuatro tarjetas. Como la
    // cabecera mide lo mismo en todas, el contenido sigue arrancando al mismo
    // offset — el aire es uniforme, no arbitrario.
    <Card data-reveal className={className}>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          {/* Alto FIJO de dos líneas, con recorte.
              `min-h` no bastaba: un subtítulo de tres líneas empujaba el
              contenido 18 px más abajo que sus vecinas de fila —medido: 103 px
              frente a 85—. Con `h` y `line-clamp-2` la cabecera mide lo mismo
              siempre, y quien escriba el texto tiene un presupuesto claro. */}
          <p className="mt-1.5 line-clamp-2 h-[2.1rem] text-[0.7rem] leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <span className="relative flex shrink-0 items-center justify-center">
          {/* Halo DECORATIVO: es lo que late en esta tarjeta. Va detrás del
              icono y no es clicable —`aria-hidden`, sin foco— porque animar en
              bucle algo que se puede pulsar deja un blanco móvil. */}
          <span
            data-card-glow
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-2xl bg-primary/15"
          />
          <span
            data-card-icon
            className="relative flex size-10 items-center justify-center rounded-2xl bg-muted text-muted-foreground"
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </span>
      </CardHeader>
      <CardContent className={cn("flex flex-1 flex-col", contentClassName)}>
        {children}
        {link ? (
          <Link
            href={link.href}
            className="mt-auto inline-flex w-fit items-center gap-1 pt-4 text-[0.7rem] font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {link.label}
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
        ) : null}
      </CardContent>
    </Card>
  );
}
