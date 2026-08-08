/**
 * SettingsPage (pestaña Negocio) — catálogos de país/moneda: Venezuela/VES
 * existen, un valor guardado fuera de catálogo se conserva como opción (no
 * desaparece del trigger) y cambiar el país muestra el hint de autofill.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Business, BusinessConfig } from "@/lib/types";

import SettingsPage from "../page";

const { api } = vi.hoisted(() => ({
  api: {
    getBusinessConfig: vi.fn(),
    updateBusinessConfig: vi.fn(),
  },
}));

vi.mock("@/lib/api/businesses", () => ({
  getBusinessHours: vi.fn().mockResolvedValue([]),
  putBusinessHours: vi.fn(),
  updateBusiness: vi.fn(),
  getScheduleBlocks: vi.fn().mockResolvedValue([]),
  createScheduleBlock: vi.fn(),
  deleteScheduleBlock: vi.fn(),
  getBusinessConfig: api.getBusinessConfig,
  updateBusinessConfig: api.updateBusinessConfig,
}));

/** The business's voice, as the backend returns it. */
const config: BusinessConfig = {
  tone: "casual",
  welcome_message: "",
  fallback_message: "",
  out_of_hours_message: "Estamos cerrados.",
  out_of_hours_ack_message: "",
  human_handoff_message: "",
  handoff_waiting_ack_message: "",
  handoff_timeout_revert_message: "",
  off_topic_message: "",
  business_context: "Barbería en el centro.",
};

beforeEach(() => {
  // Call history too, not just the implementations: several cases assert on
  // `mock.calls[0]`, which leaks between tests without this.
  vi.clearAllMocks();
  api.getBusinessConfig.mockResolvedValue(config);
  api.updateBusinessConfig.mockImplementation(async (patch) => ({
    ...config,
    ...patch,
  }));
});
vi.mock("@/lib/api/whatsapp", () => ({ listTemplates: vi.fn() }));
vi.mock("@/lib/business", () => ({
  useBusiness: () => ({
    business,
    state: "ready",
    error: null,
    refetch: vi.fn(),
  }),
}));

// País y moneda guardados fuera del catálogo del front (moneda sí válida en backend).
const business: Business = {
  id: "biz-1",
  name: "PET Spa",
  country: "BR",
  address: "Av. Test 123",
  currency: "BOB",
  language: "es",
  timezone: "America/La_Paz",
  is_active: true,
  is_operative: true,
  whatsapp_connected: false,
  whatsapp_number: "",
  onboarding_status: "completed",
  assistant_config: { display_name: "Maya", tone: "casual", welcome_message: "" },
};

describe("SettingsPage — catálogo de país/moneda", () => {
  it("ofrece Venezuela, conserva un país fuera de catálogo y muestra el hint de autofill", async () => {
    render(<SettingsPage />);
    const trigger = await screen.findByLabelText("País");
    await userEvent.click(trigger);
    expect(
      await screen.findByRole("option", { name: "Venezuela" }),
    ).toBeInTheDocument();
    // El valor guardado "BR" no está en el catálogo pero sigue siendo una opción.
    expect(screen.getByRole("option", { name: "BR" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("option", { name: "Venezuela" }));
    expect(
      await screen.findByText(
        "Se actualizaron la moneda y la zona horaria según el país.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Zona horaria")).toHaveValue("America/Caracas");
    // El trigger resuelve el label desde `items` (no el código crudo "VE").
    expect(trigger).toHaveTextContent("Venezuela");
    expect(screen.getByLabelText("Idioma del negocio")).toHaveTextContent("Español");
  });

  it("ofrece VES y conserva una moneda fuera de catálogo como opción", async () => {
    render(<SettingsPage />);
    const trigger = await screen.findByLabelText("Moneda");
    await userEvent.click(trigger);
    expect(
      await screen.findByRole("option", { name: "VES — Bolívar venezolano" }),
    ).toBeInTheDocument();
    // El valor guardado "BOB" no está en el catálogo pero sigue siendo una opción.
    expect(screen.getByRole("option", { name: "BOB" })).toBeInTheDocument();

    // El trigger resuelve el label desde `items` (no el código crudo "VES").
    await userEvent.click(
      screen.getByRole("option", { name: "VES — Bolívar venezolano" }),
    );
    expect(trigger).toHaveTextContent("VES — Bolívar venezolano");
  });
});

/** The page opens on «Negocio»; these fields live in «Asistente», so get there
 * the way the operator does. */
async function openAsistente() {
  render(<SettingsPage />);
  await userEvent.click(await screen.findByRole("tab", { name: /Asistente/i }));
  return screen.findByLabelText("Sobre tu negocio");
}

describe("SettingsPage — la voz del negocio", () => {
  it("carga los mensajes del negocio y deja el guardado apagado hasta que algo cambia", async () => {
    const context = await openAsistente();
    expect(context).toHaveValue("Barbería en el centro.");
    // Nothing edited yet: saving would be a pointless write.
    expect(screen.getByRole("button", { name: /Guardar mensajes/i })).toBeDisabled();
  });

  it("no bloquea el guardado por un campo pasado de largo que no se está mandando", async () => {
    // Staff can write past the cap from /boss-mode/ (the model columns are plain
    // TextFields). The guard scanned all eight fields, so one over-cap value locked the
    // whole card — even though the PATCH would not carry it and therefore could not 422.
    api.getBusinessConfig.mockResolvedValue({
      ...config,
      fallback_message: "x".repeat(1200),
    });

    const context = await openAsistente();
    await userEvent.clear(context);
    await userEvent.type(context, "Cortes clásicos.");

    const save = screen.getByRole("button", { name: /Guardar mensajes/i });
    expect(save).toBeEnabled();
    await userEvent.click(save);

    expect(api.updateBusinessConfig.mock.calls[0][0]).toEqual({
      business_context: "Cortes clásicos.",
    });
  });

  it("sí bloquea el guardado cuando el campo pasado de largo ES el editado", async () => {
    // 1002, not 1200: `maxLength` blocks INSERTION, so typing into an over-cap field is a
    // no-op and the field never becomes dirty — the first version of this test asserted a
    // disabled button that `!cfgDirty` had already disabled, so it passed with the guard
    // deleted (review 2026-07-27, round 4). Deleting is the only reachable path, and two
    // backspaces walk across the boundary.
    api.getBusinessConfig.mockResolvedValue({
      ...config,
      fallback_message: "x".repeat(1002),
    });

    await openAsistente();
    const fallback = screen.getByLabelText(/Cuando no logra ayudar/i);
    const save = screen.getByRole("button", { name: /Guardar mensajes/i });

    await userEvent.click(fallback);
    await userEvent.keyboard("{Backspace}"); // 1001 — dirty AND still over the cap
    expect(save).toBeDisabled();

    await userEvent.keyboard("{Backspace}"); // 1000 — dirty and legal
    expect(save).toBeEnabled();
  });

  it("no pisa el tono ni la bienvenida que guardó la tarjeta de arriba", async () => {
    // Both cards write the same config row, and this one used to PATCH the whole object
    // it loaded at mount — so saving a message reverted a tone change made seconds
    // earlier, two buttons apart in the same tab (review 2026-07-27).
    const context = await openAsistente();
    await userEvent.clear(context);
    await userEvent.type(context, "Cortes clásicos.");
    await userEvent.click(screen.getByRole("button", { name: /Guardar mensajes/i }));

    const sent = api.updateBusinessConfig.mock.calls[0][0];
    expect(sent).not.toHaveProperty("tone");
    expect(sent).not.toHaveProperty("welcome_message");
    // Only what actually changed travels.
    expect(Object.keys(sent)).toEqual(["business_context"]);
  });

  it("guarda lo que el operador escribió y manda SOLO campos de la voz del negocio", async () => {
    const context = await openAsistente();
    await userEvent.clear(context);
    await userEvent.type(context, "Cortes clásicos y barbería tradicional.");

    const save = screen.getByRole("button", { name: /Guardar mensajes/i });
    expect(save).toBeEnabled();
    await userEvent.click(save);

    expect(api.updateBusinessConfig).toHaveBeenCalledTimes(1);
    const sent = api.updateBusinessConfig.mock.calls[0][0];
    expect(sent.business_context).toBe("Cortes clásicos y barbería tradicional.");
    // What decides how the assistant BEHAVES is not the tenant's to send.
    for (const forbidden of [
      "llm_model",
      "llm_provider",
      "settings",
      "identity_message",
      "appointment_created_template",
    ]) {
      expect(sent).not.toHaveProperty(forbidden);
    }
  });

  it("muestra el contador de caracteres del contexto", async () => {
    await openAsistente();
    // "Barbería en el centro." = 22 chars, cap 4000.
    expect(screen.getByText("22/4000")).toBeInTheDocument();
  });
});
