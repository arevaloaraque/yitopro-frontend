/**
 * NotificationsProvider — which SSE events surface as toasts / bell entries.
 *
 * Customer/service domain events are DATA-SYNC signals (they refresh lists and
 * the drawer), not user alerts — and they're mostly the operator's own echo, so
 * toasting them would be noise. They must stay silent. Real alerts (a new
 * WhatsApp message) must still toast and land in the bell.
 */
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SSEEvent } from "@/lib/types";

import { NotificationsProvider, useNotifications } from "../notifications-context";

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
  toastFns: { base: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => {
  const toast = Object.assign(toastFns.base, {
    success: toastFns.success,
    warning: toastFns.warning,
    error: toastFns.error,
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
    toastFns.error.mock.calls.length
  );
}

beforeEach(() => {
  sseHandlers.length = 0;
  toastFns.base.mockClear();
  toastFns.success.mockClear();
  toastFns.warning.mockClear();
  toastFns.error.mockClear();
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

    expect(toastFns.success).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("toasts (neutral, not success) for a modified draft order (pedido_borrador_actualizado)", () => {
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

    expect(toastFns.base).toHaveBeenCalledTimes(1);
    expect(toastFns.base).toHaveBeenCalledWith("Pedido actualizado", expect.anything());
    expect(toastFns.success).not.toHaveBeenCalled();
    expect(screen.getByTestId("count").textContent).toBe("1");
  });
});
