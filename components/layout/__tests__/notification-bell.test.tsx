/**
 * The topbar bell.
 *
 * This file exists because the component had been rewritten three times with ZERO
 * coverage, and the third rewrite shipped a crash: `DropdownMenuLabel` reads its Base UI
 * group context non-optionally and throws without a `Menu.Group` around it, so opening
 * the panel unmounted the whole authenticated layout — with 217 other tests green
 * (review 2026-07-27, round 3). The first test here is deliberately the dumbest possible
 * one: open it.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppNotification } from "@/lib/notifications";

import { NotificationBell } from "../notification-bell";

const state = {
  notifications: [] as AppNotification[],
  unreadCount: 0,
  markAllRead: vi.fn(),
  soundMuted: false,
  toggleSound: vi.fn(),
};

vi.mock("@/lib/notifications", () => ({
  useNotifications: () => state,
}));

const notification = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: "n1",
  type: "mensaje_recibido",
  title: "Nuevo mensaje",
  description: "Un cliente envió un mensaje por WhatsApp",
  tone: "default",
  at: new Date().toISOString(),
  read: false,
  href: "/conversations?id=7",
  ...over,
});

beforeEach(() => {
  state.notifications = [];
  state.unreadCount = 0;
  state.soundMuted = false;
  state.markAllRead.mockClear();
  state.toggleSound.mockClear();
});

describe("NotificationBell", () => {
  it("opens without throwing, empty", async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: /Notificaciones/i }));

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.getByText(/Sin notificaciones por ahora/i)).toBeInTheDocument();
    expect(state.markAllRead).toHaveBeenCalledTimes(1);
  });

  it("opens without throwing, with entries", async () => {
    state.notifications = [
      notification(),
      notification({
        id: "n2",
        type: "error_integracion",
        title: "Error de integración",
        tone: "error",
        href: undefined,
      }),
    ];
    state.unreadCount = 2;
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: /Notificaciones/i }));

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Nuevo mensaje")).toBeInTheDocument();
    expect(within(menu).getByText("Error de integración")).toBeInTheDocument();
    // The error events are the only ones with no destination, so their row is inert —
    // announced as such rather than as an actionable menuitem that does nothing.
    expect(
      within(menu).getByRole("menuitem", { name: /Error de integración/i }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("makes an entry with a destination a real link", async () => {
    state.notifications = [notification()];
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: /Notificaciones/i }));

    const link = await screen.findByRole("menuitem", { name: /Nuevo mensaje/i });
    // The bell used to be a dead end: "Nuevo mensaje" with no way to reach the message.
    expect(link).toHaveAttribute("href", "/conversations?id=7");
  });

  it("announces the sound state and its name consistently", async () => {
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: /Notificaciones/i }));

    // Name FIXED, checked = "sound on". A label that flipped with the state made
    // aria-checked and the accessible name contradict each other.
    const toggle = await screen.findByRole("menuitemcheckbox", {
      name: /Avisos con sonido/i,
    });
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await userEvent.click(toggle);
    expect(state.toggleSound).toHaveBeenCalledTimes(1);
    // …and it does not close the panel, which is the point of sitting here.
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("reflects a muted preference without renaming the control", async () => {
    state.soundMuted = true;
    render(<NotificationBell />);
    await userEvent.click(screen.getByRole("button", { name: /Notificaciones/i }));

    const toggle = await screen.findByRole("menuitemcheckbox", {
      name: /Avisos con sonido/i,
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("announces the unread count for a screen reader, with a singular form", () => {
    state.unreadCount = 1;
    const { container } = render(<NotificationBell />);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe("1 notificación sin leer");
  });
});
