/**
 * `dayLabel` — la etiqueta de las píldoras de día del hilo de conversaciones.
 *
 * Las fechas son RELATIVAS a hoy, nunca fijas: una fija convierte el test en una
 * bomba de tiempo que pasa hoy y falla el año que viene (mismo criterio que los
 * fixtures de `app/(app)/reports/__tests__/page.test.tsx`).
 */
import { describe, expect, it } from "vitest";

import { dayLabel } from "@/lib/format/date";

/** Un ISO a la hora indicada, N días antes de hoy, en la zona LOCAL. */
function diasAtras(n: number, hora = 12): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hora, 0, 0, 0);
  return d.toISOString();
}

describe("dayLabel", () => {
  it("hoy y ayer se nombran, no se fechan", () => {
    expect(dayLabel(diasAtras(0))).toBe("Hoy");
    expect(dayLabel(diasAtras(1))).toBe("Ayer");
  });

  it("compara por día local, no por diferencia de horas", () => {
    // 00:30 de hoy son «menos de 24 h» pero es HOY; y 23:30 de ayer son «hace
    // una hora» a las 00:30 y siguen siendo AYER. Restar 86.400.000 ms se
    // equivoca en los dos.
    expect(dayLabel(diasAtras(0, 0))).toBe("Hoy");
    expect(dayLabel(diasAtras(1, 23))).toBe("Ayer");
  });

  it("de anteayer en adelante lleva fecha, y el año solo si no es el actual", () => {
    const anteayer = dayLabel(diasAtras(2));
    expect(anteayer).not.toBe("Hoy");
    expect(anteayer).not.toBe("Ayer");
    // Este año: sin año en la etiqueta. El año en curso aparecería como 4 dígitos.
    expect(anteayer).not.toMatch(/\d{4}/);

    const viejo = new Date();
    viejo.setFullYear(viejo.getFullYear() - 2);
    expect(dayLabel(viejo.toISOString())).toMatch(String(viejo.getFullYear()));
  });
});
