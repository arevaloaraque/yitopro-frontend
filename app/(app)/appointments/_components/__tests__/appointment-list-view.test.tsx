/**
 * AppointmentListView — la fila abre el detalle sin romper el <tbody> y sin
 * secuestrar el teclado de los botones que lleva dentro.
 *
 * Regresión 1: la primera versión envolvía la fila en PopoverTrigger, cuyo
 * focus-guard <span> quedaba como hijo ilegal de <tbody> y Next reportaba
 * un hydration error. Ahora la fila solo REPORTA el click y cede su elemento
 * como anchor de un popover controlado.
 *
 * Regresión 2 (CITAS-07, WCAG 2.1.1): la fila escuchaba `keyDown` y hacía
 * `preventDefault()`, que mata el click nativo que Enter dispara sobre un
 * <button>. Se tabulaba hasta «Ver historial», se pulsaba Enter y se abría el
 * detalle. El acceso por teclado vive ahora en un botón real de la celda.
 */
import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listPayments } from "@/lib/api/payments";

import { AppointmentListView } from "../appointment-list-view";
import type { EnrichedAppointment } from "../types";

vi.mock("@/lib/api/payments");

const appointment: EnrichedAppointment = {
  id: "apt-1",
  service_id: "svc-1",
  professional_id: "pro-1",
  customer_id: "cust-1",
  customer_name: "Ana Díaz",
  start: "2099-08-05T14:00:00-04:00",
  end: "2099-08-05T15:00:00-04:00",
  status: "scheduled",
  created_by: "human",
  notes: null,
  customerName: "Ana Díaz",
  serviceName: "Corte de pelo",
  professionalName: "Camila",
} as EnrichedAppointment;

// Pasada: `AppointmentActions` deja entonces UN botón directo en la fila
// («Ver historial») en vez del menú, que es el caso donde Enter se perdía.
const pastAppointment: EnrichedAppointment = {
  ...appointment,
  id: "apt-0",
  customerName: "Bruno Soto",
  serviceName: "Baño",
  start: "2020-01-05T14:00:00-04:00",
  end: "2020-01-05T15:00:00-04:00",
} as EnrichedAppointment;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listPayments).mockResolvedValue({
    items: [],
    next_cursor: "",
    has_more: false,
  });
});

function renderList(
  appointments: EnrichedAppointment[] = [appointment],
  props: Partial<ComponentProps<typeof AppointmentListView>> = {},
) {
  const handlers = {
    total: appointments.length,
    loading: false,
    onLoadMore: vi.fn(),
    onCancel: vi.fn(),
    onReschedule: vi.fn(),
    onHistory: vi.fn(),
    onCreatePaymentLink: vi.fn(),
    ...props,
  };
  render(<AppointmentListView appointments={appointments} {...handlers} />);
  return handlers;
}

describe("AppointmentListView — detalle al click", () => {
  it("abre la tarjeta de la cita al hacer click en la fila", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByText("Ana Díaz"));

    // La tarjeta muestra el detalle; el nombre ahora está dos veces: fila + tarjeta.
    expect(await screen.findAllByText("Ana Díaz")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Ver historial" })).toBeInTheDocument();
  });

  it("no deja focus-guards de Base UI dentro del tbody", async () => {
    const user = userEvent.setup();
    renderList();

    await user.click(screen.getByText("Ana Díaz"));
    await screen.findAllByText("Ana Díaz");

    expect(document.querySelectorAll("tbody [data-base-ui-focus-guard]")).toHaveLength(
      0,
    );
  });
});

describe("AppointmentListView — teclado (CITAS-07)", () => {
  it("Enter sobre el botón de la fila ejecuta SU acción, no abre el detalle", async () => {
    const user = userEvent.setup();
    const onHistory = vi.fn();
    renderList([pastAppointment], { onHistory });

    screen.getByRole("button", { name: "Ver historial" }).focus();
    await user.keyboard("{Enter}");

    expect(onHistory).toHaveBeenCalledTimes(1);
    // Y el detalle NO se abrió: el nombre sigue apareciendo una sola vez.
    expect(screen.getAllByText("Bruno Soto")).toHaveLength(1);
  });

  it("abre el detalle desde el teclado con el botón de la celda", async () => {
    const user = userEvent.setup();
    renderList();

    screen
      .getByRole("button", {
        name: "Ver detalle de la cita de Ana Díaz: Corte de pelo",
      })
      .focus();
    await user.keyboard("{Enter}");

    expect(await screen.findAllByText("Ana Díaz")).toHaveLength(2);
  });
});

describe("AppointmentListView — orden (CITAS-09 revisado)", () => {
  it("respeta el orden del servidor y no reordena en el navegador", () => {
    // El reorden descendente que había acá era incompatible con la paginación
    // real: el servidor ordena por `start_datetime` ascendente, así que «Cargar
    // más» trae citas MÁS NUEVAS que, al reordenar, saltaban arriba de las que
    // ya estaban y movían la fila que el operador estaba leyendo. Mostrar lo
    // último primero necesita un `ordering` en el backend.
    renderList([pastAppointment, appointment]);

    const first = screen.getAllByRole("row")[1];
    expect(first).toHaveTextContent("Bruno Soto");
  });
});

describe("AppointmentListView — paginación", () => {
  it("dice cuántas citas hay detrás y ofrece traer las que faltan", async () => {
    const user = userEvent.setup();
    // 1 en pantalla, 137 en el filtro: el `count` es del servidor. Sin esto la
    // lista mostraba lo que cupo en una respuesta sin decir que faltaba nada.
    const { onLoadMore } = renderList([appointment], { total: 137 });

    expect(screen.getByText("Mostrando 1 de 137")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cargar más" }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("sin más páginas no ofrece «Cargar más»", () => {
    renderList([appointment], { total: 1 });

    expect(screen.getByText("Mostrando 1 de 1")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cargar más" }),
    ).not.toBeInTheDocument();
  });
});
