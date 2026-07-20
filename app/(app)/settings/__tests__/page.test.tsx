/**
 * SettingsPage (pestaña Negocio) — catálogos de país/moneda: Venezuela/VES
 * existen, un valor guardado fuera de catálogo se conserva como opción (no
 * desaparece del trigger) y cambiar el país muestra el hint de autofill.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Business } from "@/lib/types";

import SettingsPage from "../page";

vi.mock("@/lib/api/businesses", () => ({
  getBusinessHours: vi.fn().mockResolvedValue([]),
  putBusinessHours: vi.fn(),
  updateBusiness: vi.fn(),
  getScheduleBlocks: vi.fn().mockResolvedValue([]),
  createScheduleBlock: vi.fn(),
  deleteScheduleBlock: vi.fn(),
}));
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
