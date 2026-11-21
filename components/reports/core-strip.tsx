"use client";

import { Bot, Clock, MessageSquare, MoonStar, PhoneCall } from "lucide-react";

import { KpiCard } from "@/components/reports/kpi-card";
import type { ValueSummary } from "@/lib/api/reports";
import { useCountUp } from "@/lib/hooks/use-count-up";

/** Cómo se nombra en pantalla cada motivo de derivación del backend. */
const TRIGGER_LABELS: Record<string, string> = {
  ai: "la IA lo decidió",
  customer: "lo pidió el cliente",
  rule: "una regla del negocio",
  timeout: "el cliente esperó demasiado",
};

/**
 * Tira de indicadores del núcleo universal: lo que yitopro ES para cualquier
 * negocio (respuestas, derivaciones, velocidad, fuera de horario, actividad).
 * Se muestra solo cuando hay actividad — con `replies` en cero la página pone
 * un vacío en su lugar y aquí no se renderiza ninguna tarjeta en cero.
 *
 * Ninguna tarjeta lleva chip de variación: el backend no devuelve una ventana
 * previa para estas métricas. La única comparación honesta de la pantalla vive
 * en cobros, que sí la trae.
 */
export function CoreStrip({
  core,
  animate,
}: {
  core: ValueSummary["core"];
  animate: boolean;
}) {
  const totalReplies = core.replies.ai + core.replies.operator;
  const { handoffs, response_time: rt, out_of_hours: oh, ai_activity: ai } = core;
  const pending = handoffs.total - handoffs.resolved;

  return (
    // `last-child:nth-child(odd)`: con 2 columnas, un número impar de tarjetas
    // —son 4 o 5 según haya podido medirse el tiempo de respuesta— dejaba la
    // última huérfana a media fila. Así ocupa el ancho completo en vez de un
    // hueco. Solo por debajo de `lg`, que es donde la grilla tiene 2 columnas.
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5 max-lg:[&>*:last-child:nth-child(odd)]:col-span-2">
      <CountCard
        label="Respuestas del asistente"
        n={core.replies.ai}
        animate={animate}
        hint={`de ${n(totalReplies)} respuestas enviadas en total`}
        icon={MessageSquare}
        tone="accent"
        link={{ href: "/conversations", label: "Ver conversaciones" }}
      />
      <CountCard
        label="Derivaciones a una persona"
        n={handoffs.total}
        animate={animate}
        // El número accionable es el que queda ABIERTO: son clientes esperando
        // a alguien ahora mismo. «41 de 46 atendidas» lo escondía en positivo.
        hint={
          handoffs.total === 0
            ? "el asistente resolvió solo"
            : pending > 0
              ? `${n(pending)} ${pending === 1 ? "sigue esperando" : "siguen esperando"} a una persona`
              : `todas atendidas · ${topTrigger(handoffs.by_trigger)}`
        }
        icon={PhoneCall}
        tone={pending > 0 ? "warning" : "default"}
        link={{ href: "/conversations", label: "Ver conversaciones" }}
      />
      {/* La tarjeta de velocidad solo existe cuando el backend pudo medirla
          (response_time null = ninguna respuesta dentro del recorte). El número
          grande YA es la mediana: el subtítulo aporta el p90 y la base sobre la
          que se calculan, no la repite. */}
      {rt ? (
        <KpiCard
          label="Tiempo de respuesta"
          value={formatSeconds(rt.median_s)}
          hint={`mitad de las respuestas · p90 ${formatSeconds(rt.p90_s)} · base: ${n(rt.n)} de ${n(rt.n_total)} bajo ${formatCutoff(rt.cutoff_s)}`}
          icon={Clock}
        />
      ) : null}
      {oh.schedule_configured ? (
        <CountCard
          label="Fuera de horario"
          n={oh.inbound_outside}
          animate={animate}
          hint="mensajes recibidos con el local cerrado"
          icon={MoonStar}
        />
      ) : (
        // Sin horario no hay "fuera de horario" que contar: decir «0» se
        // leería como que la IA no aportó nada.
        <KpiCard
          label="Fuera de horario"
          value="—"
          hint="Sin horario configurado: no se puede saber qué mensaje llegó con el local cerrado."
          icon={MoonStar}
          link={{ href: "/settings", label: "Configurar horario" }}
        />
      )}
      <CountCard
        label="Tareas del asistente"
        n={ai.calls}
        animate={animate}
        hint={
          ai.errors > 0
            ? `${n(ai.errors)} ${ai.errors === 1 ? "falló" : "fallaron"}`
            : "todas sin errores"
        }
        icon={Bot}
        tone={ai.errors > 0 ? "warning" : "default"}
        link={{ href: "/agents", label: "Ver agentes" }}
      />
    </div>
  );
}

/**
 * El motivo dominante de las derivaciones, solo si hay UNO solo.
 *
 * Con empate no se nombra a ninguno: `by_trigger` es un diccionario y su orden
 * de claves es de inserción, así que «el principal» con dos motivos empatados
 * sería el que el backend serializó primero, no el del negocio.
 */
function topTrigger(byTrigger: Record<string, number>): string {
  const ranked = Object.entries(byTrigger)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const [first, second] = ranked;
  if (!first || (second && second[1] === first[1])) return "por varios motivos";
  return `sobre todo, ${TRIGGER_LABELS[first[0]] ?? first[0]}`;
}

/** KpiCard cuyo número sube con count-up. El hook vive aquí, un nivel abajo,
 *  para que las tarjetas condicionales de la tira no violen las reglas de los
 *  hooks. */
function CountCard({
  n: target,
  animate,
  ...props
}: Omit<React.ComponentProps<typeof KpiCard>, "value"> & {
  n: number;
  animate: boolean;
}) {
  const value = useCountUp(target, animate);
  return <KpiCard {...props} value={n(value)} />;
}

/** 12000 → "12.000". Un contador de cuatro cifras sin separador se lee mal. */
function n(value: number): string {
  return value.toLocaleString("es-CL");
}

/** 6.1 → "6,1 s" (es-CL, un decimal cuando lo hay). */
function formatSeconds(s: number): string {
  return `${s.toLocaleString("es-CL", { maximumFractionDigits: 1 })} s`;
}

/** 300 → "<5 min"; 45 → "<45 s". */
function formatCutoff(cutoffS: number): string {
  return cutoffS % 60 === 0 ? `<${cutoffS / 60} min` : `<${cutoffS} s`;
}
