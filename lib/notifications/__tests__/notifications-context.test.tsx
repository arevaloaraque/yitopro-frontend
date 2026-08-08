/**
 * NotificationsProvider — which SSE events surface as toasts / bell entries.
 *
 * Customer/service domain events are DATA-SYNC signals (they refresh lists and
 * the drawer), not user alerts — and they're mostly the operator's own echo, so
 * toasting them would be noise. They must stay silent. Real alerts (a new
 * WhatsApp message) must still toast and land in the bell.
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SSEEvent } from "@/lib/types";

import { NotificationsProvider, useNotifications } from "../notifications-context";
import { setToastsEnabled } from "../preferences";

const { sseHandlers } = vi.hoisted(() => ({
  sseHandlers: [] as ((event: SSEEvent) => void)[],
}));
vi.mock("@/lib/sse", () => ({
  subscribeToEvents: (handler: (event: SSEEvent) => void) => {
    sseHandlers.push(handler);
    return () => {};
  },
}));

const { toastFns } = vi.hoisted(() => ({
  toastFns: {
    base: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    // El provider usa `custom`: la tarjeta del aviso es markup propio para que TODA la caja
    // sea el enlace al destino (antes había un botón «Ver» adentro).
    custom: vi.fn(),
    dismiss: vi.fn(),
  },
}));
vi.mock("sonner", () => {
  const toast = Object.assign(toastFns.base, {
    success: toastFns.success,
    warning: toastFns.warning,
    error: toastFns.error,
    custom: toastFns.custom,
    dismiss: toastFns.dismiss,
  });
  return { toast };
});

function emitSse(event: SSEEvent) {
  act(() => {
    for (const handler of sseHandlers) handler(event);
  });
}

function Probe() {
  const { unreadCount } = useNotifications();
  return <span data-testid="count">{unreadCount}</span>;
}

function totalToasts() {
  return (
    toastFns.base.mock.calls.length +
    toastFns.success.mock.calls.length +
    toastFns.warning.mock.calls.length +
    toastFns.error.mock.calls.length +
    toastFns.custom.mock.calls.length
  );
}

/** Renderiza la tarjeta que el provider le pasó a `toast.custom` en esa posición. */
function renderCard(i = 0) {
  const build = toastFns.custom.mock.calls[i][0] as (id: number) => React.ReactElement;
  return render(build(i + 1));
}

beforeEach(() => {
  sseHandlers.length = 0;
  toastFns.base.mockClear();
  toastFns.success.mockClear();
  toastFns.warning.mockClear();
  toastFns.error.mockClear();
  toastFns.custom.mockClear();
  toastFns.dismiss.mockClear();
  // La preferencia vive en localStorage; sin este reset, el caso que la apaga contamina a
  // los que corren después.
  setToastsEnabled(true);
});

describe("NotificationsProvider", () => {
  it("stays silent for data-sync domain events (no toast, no bell entry)", () => {
    render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>,
    );

    emitSse({
      id: "s1",
      type: "servicio_creado",
      emitted_at: "2026-07-11T10:00:00Z",
      data: { service_id: "1", active: true },
    } as SSEEvent);
    emitSse({
      id: "c1",
      type: "cliente_creado",
      emitted_at: "2026-07-11T10:00:01Z",
      data: { customer_id: "9", origin: "whatsapp" },
    } as SSEEvent);
    emitSse({
      id: "f1",
      type: "ficha_actualizada",
      emitted_at: "2026-07-11T10:00:02Z",
      data: {
        customer_id: "9",
        record_id: "3",
        changed_by: "ai",
        fields: ["weight_kg"],
      },
    } as SSEEvent);
    emitSse({
      id: "ca1",
      type: "conversacion_asignada",
      emitted_at: "2026-07-11T10:00:03Z",
      data: { conversation_id: "1", assignee_id: "2" },
    } as SSEEvent);
    emitSse({
      id: "cc1",
      type: "conversacion_cerrada",
      emitted_at: "2026-07-11T10:00:04Z",
      data: { conversation_id: "1", reason: "idle" },
    } as SSEEvent);
    emitSse({
      id: "ag1",
      type: "agente_actualizado",
      emitted_at: "2026-07-11T10:00:05Z",
      data: { agent_type: "sales", is_active: false },
    } as SSEEvent);
    emitSse({
      id: "ne1",
      type: "negocio_actualizado",
      emitted_at: "2026-07-11T10:00:06Z",
      data: { is_operative: true },
    } as SSEEvent);

    expect(totalToasts()).toBe(0);
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("still toasts and records a real alert (mensaje_recibido)", () => {
    render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>,
    );

    emitSse({
      id: "m1",
      type: "mensaje_recibido",
      emitted_at: "2026-07-11T10:00:00Z",
      data: {
        conversation_id: "1",
        message_id: "2",
        customer_id: "9",
        preview: "hola",
      },
    } as SSEEvent);

    expect(totalToasts()).toBe(1);
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("toasts for a new draft order to confirm (pedido_borrador_creado)", () => {
    render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>,
    );

    emitSse({
      id: "p1",
      type: "pedido_borrador_creado",
      emitted_at: "2026-07-11T10:00:00Z",
      data: { order_id: "1", total: "9990", customer_id: "9" },
    } as SSEEvent);

    expect(toastFns.custom).toHaveBeenCalledTimes(1);
    expect(renderCard().container.textContent).toContain("Nuevo pedido por confirmar");
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("un borrador modificado avisa, y se distingue por su dominio no por su severidad", () => {
    render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>,
    );

    emitSse({
      id: "p2",
      type: "pedido_borrador_actualizado",
      emitted_at: "2026-07-11T10:05:00Z",
      data: { order_id: "1", total: "12990", customer_id: "9" },
    } as SSEEvent);

    // Ya no hay sabores `success`/neutro de sonner: la tarjeta es propia y lo que identifica
    // al aviso es el distintivo de su dominio (antes esto afirmaba `toast()` contra
    // `toast.success()`, una distinción que dejó de existir).
    expect(toastFns.custom).toHaveBeenCalledTimes(1);
    const { container } = renderCard();
    expect(container.textContent).toContain("Pedido actualizado");
    expect(container.querySelector("[role=img]")?.getAttribute("aria-label")).toBe("Pedido");
    expect(screen.getByTestId("count").textContent).toBe("1");
  });
});

describe("duplicate delivery", () => {
  // The original guard keyed on `event.id`, which lib/sse mints locally and monotonically,
  // so it could never hit — dead code. Its replacement keyed on `type:conversation_id`,
  // which dropped the field that actually distinguishes two inbound messages, so a burst
  // collapsed into one entry while the dashboard counted three (review 2026-07-27).
  const inbound = (messageId: string) =>
    ({
      id: `evt_${messageId}`,
      type: "mensaje_recibido",
      emitted_at: "2026-07-11T10:00:00Z",
      data: { conversation_id: "1", message_id: messageId, customer_id: "9" },
    }) as SSEEvent;

  it("keeps every message of a burst in the same conversation", () => {
    render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>,
    );

    emitSse(inbound("m1"));
    emitSse(inbound("m2"));
    emitSse(inbound("m3"));

    expect(screen.getByTestId("count").textContent).toBe("3");
    expect(totalToasts()).toBe(3);
  });

  it("still collapses a genuine redelivery (identical payload)", () => {
    render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>,
    );

    emitSse(inbound("m1"));
    emitSse(inbound("m1"));

    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(totalToasts()).toBe(1);
  });

  it("does not swallow two distinct errors seconds apart", () => {
    // These carry none of the ids the old key looked at, so they ALL collapsed into one —
    // and they are the loudest events we have.
    render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>,
    );

    emitSse({
      id: "e1",
      type: "error_integracion",
      emitted_at: "2026-07-11T10:00:00Z",
      data: { provider: "meta", error_type: "HTTPError" },
    } as SSEEvent);
    emitSse({
      id: "e2",
      type: "error_integracion",
      emitted_at: "2026-07-11T10:00:01Z",
      data: { provider: "litellm", error_type: "Timeout" },
    } as SSEEvent);

    expect(screen.getByTestId("count").textContent).toBe("2");
  });

  it("confirmar un pedido no vuelve a avisar (y ya no dice «Nuevo pedido»)", () => {
    // El backend emite `pedido_creado` al CONFIRMAR, no al crear. Anunciarlo acá producía
    // dos toasts a la vez para el mismo acto —«Pedido #31 confirmado · $17.000» junto a
    // «Nuevo pedido»— y el segundo además era falso. Confirmar es una acción del operador,
    // que ya tiene su propio aviso; `pedido_borrador_creado` sí queda ruidoso porque ESO
    // es trabajo nuevo entrando por WhatsApp.
    render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>,
    );

    emitSse({
      id: "p1",
      type: "pedido_creado",
      emitted_at: "2026-07-11T10:00:00Z",
      data: { order_id: "31", total: "17000.00", customer_id: "42" },
    } as SSEEvent);

    expect(totalToasts()).toBe(0);
    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("un aviso con destino trae cómo llegar ahí", () => {
    // Un toast que se puede leer pero no accionar obliga a recordarlo. En sonner 2.x el
    // toast no tiene `onClick`, así que el camino soportado es `action`.
    render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>,
    );

    emitSse({
      id: "d1",
      type: "pedido_borrador_creado",
      emitted_at: "2026-07-11T10:00:00Z",
      data: { order_id: "31", total: "17000.00", customer_id: "42" },
    } as SSEEvent);

    // TODA la tarjeta es el enlace, no un botón «Ver» adentro: no hay nada que alinear y el
    // área de click es la caja entera.
    const { container } = renderCard();
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/orders");
    expect(container.textContent).not.toContain("Ver");
  });

  it("cada aviso trae un distintivo que dice de qué es, no solo su severidad", () => {
    render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>,
    );

    emitSse({
      id: "d2",
      type: "pedido_borrador_creado",
      emitted_at: "2026-07-11T10:00:00Z",
      data: { order_id: "31", total: "17000.00", customer_id: "42" },
    } as SSEEvent);
    emitSse({
      id: "a2",
      type: "nueva_cita",
      emitted_at: "2026-07-11T10:00:01Z",
      data: {
        appointment_id: "7",
        customer_id: "42",
        service_id: "3",
        start: "2026-08-01T15:30:00Z",
      },
    } as SSEEvent);

    // Un pedido y una cita no pueden llevar el mismo icono: distinguirlos de un vistazo es
    // justamente lo que el aviso tiene que resolver antes de que nadie lea el texto.
    const labelOf = (i: number) =>
      renderCard(i).container.querySelector("[role=img]")?.getAttribute("aria-label");
    expect(labelOf(0)).toBe("Pedido");
    expect(labelOf(1)).toBe("Cita");
  });

  it("con los emergentes apagados no toastea, pero la campana los recibe igual", () => {
    // El contrato del interruptor de Ajustes: silencia la INTERRUPCIÓN, no la información.
    // Quien lo apaga no quiere perderse avisos, quiere elegir cuándo mirarlos.
    setToastsEnabled(false);
    render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>,
    );

    emitSse({
      id: "off1",
      type: "pedido_borrador_creado",
      emitted_at: "2026-07-11T10:00:00Z",
      data: { order_id: "31", total: "17000.00", customer_id: "42" },
    } as SSEEvent);

    expect(totalToasts()).toBe(0);
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("el aviso se puede cerrar sin navegar a su destino", async () => {
    render(
      <NotificationsProvider>
        <Probe />
      </NotificationsProvider>,
    );
    emitSse({
      id: "c1",
      type: "pedido_borrador_creado",
      emitted_at: "2026-07-11T10:00:00Z",
      data: { order_id: "31", total: "17000.00", customer_id: "42" },
    } as SSEEvent);

    // El botón de cerrar es HERMANO del enlace, no hijo: un botón dentro de un <a> es un
    // control anidado, y así cerrar no dispara la navegación.
    const { container } = renderCard();
    const cerrar = screen.getByRole("button", { name: "Cerrar aviso" });
    expect(container.querySelector("a")?.contains(cerrar)).toBe(false);
    await userEvent.click(cerrar);
    expect(toastFns.dismiss).toHaveBeenCalled();
  });
});
