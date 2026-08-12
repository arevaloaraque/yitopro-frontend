/**
 * AppointmentCalendar — la rama de vacío (CITAS-04).
 *
 * El calendario no dibujaba ninguna: con un filtro sin coincidencias la LISTA
 * decía «sin citas» y el calendario mostraba una grilla de horas muda, o sea
 * las dos vistas contestaban distinto a la misma pregunta. Y la rama se calcula
 * sobre la VENTANA VISIBLE, no sobre la lista entera: una semana sin citas
 * también tiene que decirlo aunque el negocio tenga la agenda llena en marzo.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listPayments } from "@/lib/api/payments";

import { AppointmentCalendar, calendarWindow } from "../appointment-calendar";
import type { EnrichedAppointment } from "../types";

vi.mock("@/lib/api/payments");

const HOUR = 60 * 60 * 1000;

function makeAppointment(start: Date): EnrichedAppointment {
  return {
    id: `apt-${start.getTime()}`,
    service_id: "svc-1",
    professional_id: "pro-1",
    customer_id: "cust-1",
    customer_name: "Ana Díaz",
    start: start.toISOString(),
    end: new Date(start.getTime() + HOUR).toISOString(),
    status: "scheduled",
    created_by: "human",
    notes: null,
    customerName: "Ana Díaz",
    serviceName: "Corte de pelo",
    professionalName: "Camila",
  } as EnrichedAppointment;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPayments).mockResolvedValue({
    items: [],
    next_cursor: "",
    has_more: false,
  });
});

function renderCalendar(
  appointments: EnrichedAppointment[],
  filtersActive = false,
  onClearFilters = vi.fn(),
  onCursorChange = vi.fn(),
) {
  render(
    <AppointmentCalendar
      appointments={appointments}
      // Rango y posición los controla la página: son lo que decide qué citas se
      // piden al backend (`date_from`/`date_to`).
      view="week"
      onViewChange={vi.fn()}
      cursor={new Date()}
      onCursorChange={onCursorChange}
      filtersActive={filtersActive}
      onClearFilters={onClearFilters}
      onCancel={vi.fn()}
      onReschedule={vi.fn()}
      onHistory={vi.fn()}
      onCreatePaymentLink={vi.fn()}
    />,
  );
  return onClearFilters;
}

describe("AppointmentCalendar — rama de vacío", () => {
  it("avisa cuando no hay ninguna cita", () => {
    renderCalendar([]);
    expect(screen.getByText("Sin citas")).toBeInTheDocument();
  });

  it("avisa aunque haya citas, si ninguna cae en la ventana visible", () => {
    // Un año atrás: existe en la lista, no en la semana que se está mirando.
    renderCalendar([makeAppointment(new Date(Date.now() - 365 * 24 * HOUR))]);
    expect(screen.getByText("Sin citas")).toBeInTheDocument();
  });

  it("con filtro puesto ofrece limpiarlo en vez de decir que no hay citas", async () => {
    const user = userEvent.setup();
    const onClearFilters = renderCalendar([], true);

    expect(screen.getByText("Sin coincidencias")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it("dibuja la grilla cuando la ventana visible sí tiene citas", () => {
    // Mediodía de hoy: cae en la semana (y en el día) que el calendario abre.
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    renderCalendar([makeAppointment(today)]);

    expect(screen.queryByText("Sin citas")).not.toBeInTheDocument();
    expect(screen.getByText("Ana Díaz")).toBeInTheDocument();
  });
});

describe("AppointmentCalendar — navegación controlada", () => {
  it("no mueve el cursor por su cuenta: se lo pide a la página", async () => {
    // La ventana visible es lo que define qué citas se piden, así que el
    // calendario no puede guardarse esa posición: si navegara por dentro, la
    // página seguiría mostrando los datos de la semana anterior.
    const user = userEvent.setup();
    const onCursorChange = vi.fn();
    renderCalendar([], false, vi.fn(), onCursorChange);

    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(onCursorChange).toHaveBeenCalledTimes(1);
    const next = onCursorChange.mock.calls[0][0] as Date;
    // Una semana más adelante (la vista es «week»).
    expect(Math.round((next.getTime() - Date.now()) / 86_400_000)).toBe(7);
  });
});

describe("calendarWindow — la ventana visible es lo que se le pide al backend", () => {
  // El calendario navegaba en memoria sobre el historial completo del negocio;
  // con el `limit` de 100 del servidor eso deja de traer el resto SIN avisar, o
  // sea una agenda incompleta que se ve completa. Por eso ahora se pide por
  // período, y el período sale de acá.
  it("día: el día del cursor, con un día de margen a cada lado", () => {
    // Sábado 8 de agosto de 2026, hora local. El margen no es adorno: el backend
    // lee estos días en la zona del NEGOCIO y la grilla se dibuja en la del
    // NAVEGADOR, así que sin él la cita de las 23:30 del borde queda fuera y ese
    // día se ve vacío. Sobran filas, nunca faltan.
    expect(calendarWindow("day", new Date(2026, 7, 8, 15, 30))).toEqual({
      date_from: "2026-08-07",
      date_to: "2026-08-09",
    });
  });

  it("semana: de lunes a domingo", () => {
    // Mismo sábado → semana del lunes 3 al domingo 9.
    expect(calendarWindow("week", new Date(2026, 7, 8, 15, 30))).toEqual({
      date_from: "2026-08-02",
      date_to: "2026-08-10",
    });
  });

  it("mes: del primero al último día, también en febrero", () => {
    expect(calendarWindow("month", new Date(2026, 7, 8))).toEqual({
      date_from: "2026-07-31",
      date_to: "2026-09-01",
    });
    // Febrero de un año no bisiesto: el último día es el 28, no un 30 inventado.
    expect(calendarWindow("month", new Date(2026, 1, 15))).toEqual({
      date_from: "2026-01-31",
      date_to: "2026-03-01",
    });
  });

});
