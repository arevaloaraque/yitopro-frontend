/**
 * El agrupado del gráfico de cobros.
 *
 * Es la lógica que decide QUÉ forma tiene la serie en pantalla, y falla en
 * silencio: un bucket de más o de menos no rompe nada, solo dibuja un negocio
 * que no existe. De ahí que se pruebe la función y no el SVG.
 */
import { afterAll, describe, expect, it } from "vitest";

// El caso del cambio de horario solo prueba algo en una zona que lo tenga, y en
// CI el proceso corre en UTC —donde pasaría igual sin demostrar nada—. Santiago
// adelanta el reloj la noche del 2026-09-06 (verificado: el offset va de -4 a
// -3 y ese día dura 23 h), que es justo el borde que la rejilla debe sobrevivir.
//
// `TZ` es global del proceso y vitest puede correr varios archivos en el mismo
// worker, así que se restaura al terminar: otros tests derivan días LOCALES
// (`reportWindow`, `daysSinceSignup`) y heredarían esta zona sin pedirla.
const originalTz = process.env.TZ;
process.env.TZ = "America/Santiago";
afterAll(() => {
  process.env.TZ = originalTz;
});

const { bucketGrid, fold, grainFor } = await import("../revenue-chart");

const range = (from: string, to: string, days: number) => ({
  date_from: from,
  date_to: to,
  days,
});

describe("grainFor", () => {
  it("elige el grano por el largo de la ventana", () => {
    expect(grainFor(7)).toBe("day");
    expect(grainFor(31)).toBe("day");
    expect(grainFor(32)).toBe("week");
    expect(grainFor(120)).toBe("week");
    expect(grainFor(121)).toBe("month");
    expect(grainFor(366)).toBe("month");
  });
});

describe("bucketGrid", () => {
  it("por día devuelve un bucket por día, extremos incluidos", () => {
    const grid = bucketGrid(range("2026-08-01", "2026-08-07", 7), "day");
    expect(grid).toHaveLength(7);
    expect(grid[0].key).toBe("2026-08-01");
    expect(grid[6].key).toBe("2026-08-07");
  });

  it("por semana ancla en LUNES, incluso si la ventana empieza a media semana", () => {
    // 2026-08-05 es miércoles: su semana empieza el lunes 3.
    const grid = bucketGrid(range("2026-08-05", "2026-08-25", 21), "week");
    expect(grid[0].key).toBe("2026-08-03");
    expect(grid[1].key).toBe("2026-08-10");
  });

  it("por mes ancla en el día 1 y no repite meses", () => {
    const grid = bucketGrid(range("2026-04-14", "2026-08-10", 119), "month");
    expect(grid.map((b) => b.key)).toEqual([
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
    ]);
  });

  it("cruza un cambio de horario sin saltar ni repetir un día", () => {
    // Chile adelanta el reloj la noche del 2026-09-06: ese día tiene 23 h, así
    // que avanzar sumando 86.400.000 ms se saltaría una fecha. La rejilla
    // avanza por CAMPO de fecha, de modo que los días salen todos y una sola vez.
    const grid = bucketGrid(range("2026-09-04", "2026-09-09", 6), "day");
    expect(grid.map((b) => b.key)).toEqual([
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
    ]);
  });
});

describe("fold", () => {
  const series = [
    { day: "2026-08-03", currency: "CLP", paid_amount: 5000, paid_count: 1 },
    { day: "2026-08-05", currency: "CLP", paid_amount: 7000, paid_count: 2 },
    { day: "2026-08-05", currency: "USD", paid_amount: 100, paid_count: 1 },
  ];

  it("suma montos y conteos de la MISMA moneda dentro del bucket", () => {
    const grid = bucketGrid(range("2026-08-03", "2026-08-09", 7), "week");
    const rows = fold(series, "CLP", grid, "week");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 12000, count: 3 });
  });

  it("no mezcla monedas: cada una ve solo lo suyo", () => {
    const grid = bucketGrid(range("2026-08-03", "2026-08-09", 7), "week");
    expect(fold(series, "USD", grid, "week")[0]).toMatchObject({
      amount: 100,
      count: 1,
    });
  });

  it("los buckets sin cobro valen 0, no desaparecen", () => {
    // Omitirlos comprimiría el tiempo: dos días separados por una semana se
    // dibujarían pegados y la pendiente contaría un ritmo que no ocurrió.
    const grid = bucketGrid(range("2026-08-01", "2026-08-05", 5), "day");
    const rows = fold(series, "CLP", grid, "day");
    expect(rows.map((r) => r.amount)).toEqual([0, 0, 5000, 0, 7000]);
  });
});
