/**
 * The notification sound picker.
 *
 * The rule under test is "messages and orders never share a sound": the operator has to
 * tell them apart WITHOUT looking at the screen, so two identical pings would make the
 * setting pointless. It is enforced twice on purpose — the store swaps instead of
 * duplicating, and the picker does not offer the taken option at all.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import {
  getSoundAssignments,
  setSlotSound,
  SOUND_CHOICES,
} from "@/lib/notifications/sound";
import { areToastsEnabled, setToastsEnabled } from "@/lib/notifications/preferences";

import { NotificationSounds } from "../notification-sounds";

const labelOf = (id: string) => SOUND_CHOICES.find((choice) => choice.id === id)!.label;

beforeEach(() => {
  window.localStorage.clear();
  // Writes, not a bare clear(): the assignments are cached for useSyncExternalStore.
  setSlotSound("message", "ping");
  setSlotSound("order", "marimba");
});

describe("NotificationSounds", () => {
  it("shows a different sound for each of the three slots", () => {
    render(<NotificationSounds />);
    const assignments = getSoundAssignments();
    expect(new Set(Object.values(assignments)).size).toBe(3);
    for (const id of Object.values(assignments)) {
      expect(screen.getByText(labelOf(id))).toBeInTheDocument();
    }
  });

  it("does not offer a sound another slot already uses", async () => {
    render(<NotificationSounds />);
    const { message, appointment } = getSoundAssignments();

    await userEvent.click(screen.getByLabelText("Pedidos"));

    const options = await screen.findAllByRole("option");
    const labels = options.map((option) => option.textContent);
    // Both OTHER slots are excluded, not just one: with three events the picker has to
    // hide two taken timbres for "same sound twice" to stay unrepresentable.
    expect(labels).toHaveLength(SOUND_CHOICES.length - 2);
    expect(labels).not.toContain(labelOf(message));
    expect(labels).not.toContain(labelOf(appointment));
  });

  it("keeps them distinct after the operator changes one", async () => {
    render(<NotificationSounds />);
    await userEvent.click(screen.getByLabelText("Pedidos"));
    await userEvent.click(
      await screen.findByRole("option", { name: labelOf("campana") }),
    );

    const { message, order } = getSoundAssignments();
    expect(order).toBe("campana");
    expect(message).not.toBe(order);
  });

  it("lets the operator hear the sound a slot is set to", async () => {
    render(<NotificationSounds />);
    // jsdom has no AudioContext: the assertion is that the control exists and clicking
    // it is harmless (sound.ts degrades to silence rather than throwing).
    const listen = screen.getByRole("button", {
      name: /Escuchar el sonido de pedidos/i,
    });
    await userEvent.click(listen);
    expect(listen).toBeInTheDocument();
  });
});

describe("NotificationSounds — apagar los avisos emergentes", () => {
  it("arranca encendido: apagarlos es una decisión explícita", () => {
    render(<NotificationSounds />);
    expect(screen.getByLabelText("Mostrar avisos emergentes")).toBeChecked();
  });

  it("al apagarlo lo persiste, y avisa que la campana los sigue recibiendo", async () => {
    render(<NotificationSounds />);
    const toggle = screen.getByLabelText("Mostrar avisos emergentes");
    await userEvent.click(toggle);

    expect(areToastsEnabled()).toBe(false);
    expect(toggle).not.toBeChecked();
    // Que no se pierde ninguna es la mitad del contrato, y tiene que estar dicho: si no,
    // apagarlos se lee como «dejar de recibir avisos».
    expect(screen.getByText(/siguen llegando a la campana/i)).toBeInTheDocument();
  });

  it("vuelve a encenderse", async () => {
    setToastsEnabled(false);
    render(<NotificationSounds />);
    await userEvent.click(screen.getByLabelText("Mostrar avisos emergentes"));
    expect(areToastsEnabled()).toBe(true);
  });
});
