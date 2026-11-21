/**
 * Which events make noise, where each notification takes the operator, and what
 * happens when the same event is delivered twice.
 *
 * An operator console needs sound because WhatsApp arrives while the tab is in
 * the background — a toast nobody sees is not a notification. But a beep per
 * event is worse than no beep: only things that need a human get one, and echoes
 * of work already in motion (cancellations, reactivations, automatic sends) stay
 * silent even though they still land in the bell.
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

vi.mock("sonner", () => {
  // `custom` es el que usa el provider: la tarjeta del aviso es markup propio para que toda
  // la caja sea el enlace. `dismiss` lo llama el tope de 4 y el botón de cerrar.
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    custom: vi.fn(),
    dismiss: vi.fn(),
  });
  return { toast };
});

const { sound } = vi.hoisted(() => ({
  sound: {
    play: vi.fn(),
    unlock: vi.fn(),
    setMuted: vi.fn(),
    muted: { value: false },
  },
}));
vi.mock("../sound", () => ({
  playNotificationSound: sound.play,
  unlockSound: sound.unlock,
  setSoundMuted: sound.setMuted,
  isSoundMuted: () => sound.muted.value,
  subscribeSoundSettings: () => () => {},
}));

let seq = 0;
function emit(event: { type: SSEEvent["type"]; data: SSEEvent["data"] }) {
  act(() => {
    for (const handler of sseHandlers) {
      handler({
        id: `e${++seq}`,
        emitted_at: "2026-07-26T20:00:00Z",
        ...event,
      } as SSEEvent);
    }
  });
}

/** Exposes the context through the DOM (the pattern the sibling suite uses) so
 * nothing is written to a module-level binding from render. */
function Probe() {
  const { notifications, soundMuted, toggleSound } = useNotifications();
  return (
    <>
      <span data-testid="count">{notifications.length}</span>
      <span data-testid="hrefs">
        {notifications.map((n) => n.href ?? "-").join("|")}
      </span>
      <span data-testid="muted">{String(soundMuted)}</span>
      <button type="button" data-testid="toggle" onClick={toggleSound}>
        toggle
      </button>
    </>
  );
}

function mount() {
  render(
    <NotificationsProvider>
      <Probe />
    </NotificationsProvider>,
  );
}

const count = () => screen.getByTestId("count").textContent;
const hrefs = () => screen.getByTestId("hrefs").textContent;

beforeEach(() => {
  sseHandlers.length = 0;
  sound.play.mockClear();
  sound.setMuted.mockClear();
  sound.muted.value = false;
});

describe("notification sound policy", () => {
  it("pings a customer message with the message voice", () => {
    mount();
    emit({
      type: "mensaje_recibido",
      data: { conversation_id: "7", message_id: "m1" },
    });
    expect(sound.play).toHaveBeenCalledExactlyOnceWith("message");
  });

  it("uses the urgent voice when a human is being waited on", () => {
    mount();
    emit({
      type: "conversacion_escalada",
      data: { conversation_id: "7", handoff_id: "h1", triggered_by: "customer" },
    });
    expect(sound.play).toHaveBeenCalledExactlyOnceWith("alert");
  });

  it("gives the agenda its own voice, separate from orders and messages", () => {
    mount();
    emit({
      type: "nueva_cita",
      data: {
        appointment_id: "3",
        customer_id: "9",
        service_id: "1",
        start: "2026-07-28T13:00:00Z",
        origin: "ai",
      },
    });
    emit({
      type: "pedido_borrador_creado",
      data: { order_id: "2", total: "40000", customer_id: "9" },
    });
    expect(sound.play).toHaveBeenCalledTimes(2);
    // Three configurable slots, guaranteed distinct, so "the agenda moved" is told apart
    // from "an order came in" and from "a customer wrote" without looking at the screen.
    expect(sound.play).toHaveBeenNthCalledWith(1, "appointment");
    expect(sound.play).toHaveBeenNthCalledWith(2, "order");
  });

  it("uses the agenda voice for a cancellation — nobody at the console caused it", () => {
    mount();
    emit({ type: "cita_cancelada", data: { appointment_id: "3", customer_id: "9" } });
    emit({
      type: "cita_reagendada",
      data: {
        appointment_id: "3",
        customer_id: "9",
        start: "2026-07-29T15:00:00Z",
      },
    });
    // Both were silent before, so a customer cancelling from WhatsApp made no sound at
    // all — the operator found out by looking, which is what the sound exists to avoid.
    expect(sound.play).toHaveBeenCalledTimes(2);
    expect(sound.play).toHaveBeenNthCalledWith(1, "appointment");
    expect(sound.play).toHaveBeenNthCalledWith(2, "appointment");
  });

  it("stays silent for echoes of work already in motion", () => {
    mount();
    emit({
      type: "conversacion_reactivada",
      data: { conversation_id: "7", reason: "timeout" },
    });
    emit({
      type: "mensaje_automatico_enviado",
      data: {
        conversation_id: "7",
        scheduled_message_id: "1",
        rule_code: "abandoned_followup",
        customer_id: "9",
      },
    });
    expect(sound.play).not.toHaveBeenCalled();
    expect(count()).toBe("2"); // …but they are still visible in the bell
  });

  it("stays silent for data-sync events that never reach the bell", () => {
    mount();
    emit({ type: "cliente_creado", data: { customer_id: "9", origin: "whatsapp" } });
    expect(sound.play).not.toHaveBeenCalled();
    expect(count()).toBe("0");
  });

  it("exposes the mute state and writes the preference when toggled", () => {
    mount();
    expect(screen.getByTestId("muted").textContent).toBe("false");
    act(() => screen.getByTestId("toggle").click());
    expect(sound.setMuted).toHaveBeenCalledExactlyOnceWith(true);
  });
});

describe("notification deep links", () => {
  it("points a message at that conversation, not at the inbox", () => {
    mount();
    emit({
      type: "mensaje_recibido",
      data: { conversation_id: "42", message_id: "m1" },
    });
    expect(hrefs()).toBe("/conversations?id=42");
  });

  it("points a booking at the appointments list, without a parameter nobody reads", () => {
    mount();
    emit({
      type: "nueva_cita",
      data: {
        appointment_id: "5",
        customer_id: "9",
        service_id: "1",
        start: "2026-07-28T13:00:00Z",
        origin: "human",
      },
    });
    // The appointments screen never reads `id` from the query string — only
    // /conversations does — so the link asserted here used to land on the plain list with
    // a junk parameter (review 2026-07-27). Change this the day the screen reads it.
    expect(hrefs()).toBe("/appointments");
  });

  it("leaves an event with nowhere to go without a link", () => {
    mount();
    emit({
      type: "error_integracion",
      data: { provider: "meta", direction: "out", error_type: "Timeout" },
    });
    expect(hrefs()).toBe("-");
  });
});

describe("duplicate deliveries", () => {
  it("collapses the same event about the same subject arriving twice", () => {
    // The old guard keyed on `event.id`, which lib/sse mints locally and
    // monotonically — so it could never match and a redelivery double-toasted.
    mount();
    const data = { conversation_id: "7", message_id: "m1" };
    emit({ type: "mensaje_recibido", data });
    emit({ type: "mensaje_recibido", data });
    expect(count()).toBe("1");
    expect(sound.play).toHaveBeenCalledTimes(1);
  });

  it("does not collapse two different conversations", () => {
    mount();
    emit({
      type: "mensaje_recibido",
      data: { conversation_id: "7", message_id: "m1" },
    });
    emit({
      type: "mensaje_recibido",
      data: { conversation_id: "8", message_id: "m2" },
    });
    expect(count()).toBe("2");
  });
});
