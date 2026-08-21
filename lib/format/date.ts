/**
 * Date formatting for lists and detail views.
 *
 * The panel had EIGHT private copies of this logic across as many screens, in three
 * mutually inconsistent dialects (`hace 5m` / `5m` / `hace 5 min`), none exported.
 * That migration YA SE HIZO: las que quedaban con la misma salida se importan de
 * acá. Sobreviven a propósito dos que NO son el mismo dialecto —el
 * `formatDateTime` de `history-dialog.tsx` (`31/07/2026`, con año) y el `fmt` de
 * `schedule-blocks.tsx`—: unificarlas cambia lo que se lee en pantalla, que es
 * decisión de diseño y no de limpieza.
 */

const LOCALE = "es-CL";

/** Los días que un `<input type="date">` entiende: `YYYY-MM-DD`. */
const LOCALE_DIA_ISO = "sv-SE";

/** `31 jul, 14:32` — absolute, for tooltips and detail views. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * `14:32` — la hora sola, sin fecha.
 *
 * Faltaba, y por eso cada pantalla que muestra una hora la reescribía: había seis
 * copias del mismo `toLocaleTimeString` (burbuja de mensaje, lista y detalle de
 * citas, dashboard y dos veces dentro del calendario). Un hueco en este módulo se
 * paga en copias privadas, no en que la gente lo importe igual.
 */
export function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** `ahora` / `hace 5m` / `hace 3h` / `hace 2d`. */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

/**
 * «Hoy» en la zona del operador, como `YYYY-MM-DD`.
 *
 * `toISOString().slice(0,10)` daría el día UTC: en Chile, pasadas las 20:00, el
 * `max` del campo «hasta» arrancaba en mañana y el navegador daba por inválido el
 * día en curso. Estaba escrita tres veces con ese mismo párrafo al lado.
 */
export function todayISO(): string {
  return new Date().toLocaleDateString(LOCALE_DIA_ISO);
}

/** El día LOCAL de una fecha, como `YYYY-MM-DD`. Mismo motivo que `todayISO`. */
export function dayISO(d: Date): string {
  return d.toLocaleDateString(LOCALE_DIA_ISO);
}

/**
 * La etiqueta de un separador de día en un hilo: `Hoy` / `Ayer` / `vie 3 abr` /
 * `3 abr 2025`.
 *
 * El año aparece **solo** cuando no es el actual: en un hilo de WhatsApp la
 * inmensa mayoría de las píldoras son de este año y repetirlo en todas es ruido,
 * pero omitirlo en una de 2024 la haría leerse como reciente.
 *
 * Compara por día LOCAL con `dayISO`, no por diferencia de milisegundos: a las
 * 00:30 «hace 20 horas» es ayer, y restar 86.400.000 lo llamaría hoy.
 */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const dia = dayISO(d);
  const hoy = new Date();
  if (dia === dayISO(hoy)) return "Hoy";
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  if (dia === dayISO(ayer)) return "Ayer";
  return d.toLocaleDateString(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(d.getFullYear() === hoy.getFullYear() ? {} : { year: "numeric" }),
  });
}

/**
 * Cadena vacía cuando el par de fechas sirve; el motivo, cuando no.
 *
 * `maxDays` es del llamante porque cada pantalla tiene su tope y es deliberado
 * (90 en reportes, 31 en pagos): lo que no tiene por qué diferir es la validación
 * ni cómo se dicen los tres motivos.
 */
export function customRangeError(from: string, to: string, maxDays: number): string {
  if (!from || !to) return "Selecciona las dos fechas.";
  if (to < from) return "La fecha final es anterior a la inicial.";
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  if (days > maxDays) return `El rango no puede superar ${maxDays} días.`;
  return "";
}

/**
 * Relative while it still reads as "recent", absolute after that.
 *
 * A list column is where this matters: `hace 3h` answers "did this just happen?" at a
 * glance, but `hace 47d` doesn't answer anything — past a day the operator wants the
 * date. The cutoff is 24h because that is where `relativeTime` itself switches to days.
 */
export function listDate(iso: string): string {
  const ageMs = Date.now() - new Date(iso).getTime();
  if (ageMs < 86_400_000) return relativeTime(iso);
  return new Date(iso).toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
  });
}
