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
    updateBusiness: vi.fn(),
  },
}));

vi.mock("@/lib/api/businesses", () => ({
  getBusinessHours: vi.fn().mockResolvedValue([]),
  putBusinessHours: vi.fn(),
  updateBusiness: api.updateBusiness,
  getScheduleBlocks: vi.fn().mockResolvedValue([]),
  createScheduleBlock: vi.fn(),
  deleteScheduleBlock: vi.fn(),
  getBusinessConfig: api.getBusinessConfig,
  updateBusinessConfig: api.updateBusinessConfig,
}));

// `useUrlFilters` (la sección activa vive en ?tab=) lee `useSearchParams`; el
// stub es el mismo patrón que payments/__tests__/page.test.tsx.
const { searchParamsStub } = vi.hoisted(() => ({
  searchParamsStub: { current: new URLSearchParams() },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsStub.current,
}));

// ProfessionalHours se suscribe al stream (frescura del select por SSE); sin
// este stub, el lib/sse real abriría un fetch al stream en jsdom.
vi.mock("@/lib/sse", () => ({
  subscribeToEvents: () => () => {},
}));

// «Por profesional» y «Bloqueos» son secciones propias: sus cargas necesitan
// respuesta. Cubre a ProfessionalHours (importa vía el barrel @/lib/api) y a
// ScheduleBlocks (import directo) por igual.
vi.mock("@/lib/api/professionals", () => ({
  listProfessionals: vi
    .fn()
    .mockResolvedValue([{ id: "p1", name: "Coni", is_active: true }]),
  getProfessionalSchedule: vi.fn().mockResolvedValue([]),
  putProfessionalSchedule: vi.fn(),
}));

/** The business's voice (plus its scheduling policy), as the backend returns it. */
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
  flexible_scheduling: false,
  closing_grace_minutes: 0,
};

beforeEach(() => {
  // Call history too, not just the implementations: several cases assert on
  // `mock.calls[0]`, which leaks between tests without this.
  vi.clearAllMocks();
  bizRef.current = business;
  ctxStateRef.current = { state: "ready", error: null };
  whatsappApi.listTemplates.mockResolvedValue({ items: [], synced: true });
  searchParamsStub.current = new URLSearchParams();
  // `useUrlFilters` escribe la URL real (replaceState); sin esto el ?tab= de un
  // test contamina la aserción de URL del siguiente.
  window.history.replaceState(null, "", "/");
  api.getBusinessConfig.mockResolvedValue(config);
  api.updateBusinessConfig.mockImplementation(async (patch) => ({
    ...config,
    ...patch,
  }));
  // Devuelve el Business guardado, como el backend real: la franja de «cambió
  // en otra sesión» toma su huella anti-eco de ESTA respuesta.
  api.updateBusiness.mockImplementation(
    async (patch: Partial<Business> & { assistant_config?: object }) => ({
      ...business,
      ...patch,
      assistant_config: {
        ...business.assistant_config,
        ...(patch.assistant_config ?? {}),
      },
    }),
  );
});
// Hoisted para poder darle respuesta por test (flujo conectado de la card
// «Canal WhatsApp»): un vi.fn() pelado con un fixture conectado destructuraría
// undefined y el catch lo disfrazaría de templatesError plausible.
const { whatsappApi } = vi.hoisted(() => ({
  whatsappApi: { listTemplates: vi.fn() },
}));
vi.mock("@/lib/api/whatsapp", () => ({
  listTemplates: whatsappApi.listTemplates,
}));
// Refs mutables, no consts capturadas: el gating necesita un negocio SIN
// asistente, y la garantía «la cabecera se dibuja durante la carga» necesita
// un contexto que NO esté ready.
const { bizRef, ctxStateRef } = vi.hoisted(() => ({
  bizRef: { current: undefined as Business | undefined },
  ctxStateRef: {
    current: { state: "ready" as string, error: null as string | null },
  },
}));
vi.mock("@/lib/business", () => ({
  useBusiness: () => ({
    business: bizRef.current,
    state: ctxStateRef.current.state,
    error: ctxStateRef.current.error,
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
  is_blocked: false,
  whatsapp_connected: false,
  whatsapp_number: "",
  entitlements: {
    assistant: true,
    agents: ["scheduling", "sales"],
    max_professionals: 0,
    max_users: 0,
    plan_name: "",
    has_plan: true,
    active_professionals: 0,
    active_users: 1,
    max_agents: 0,
    max_reminder_rules: 0,
    can_edit_automation_timing: true,
  },
  onboarding_status: "completed",
  assistant_config: { display_name: "Maya", tone: "casual", welcome_message: "" },
  created_at: "2026-01-01T00:00:00Z",
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

/** The scheduling-policy card lives in «Horario», next to the opening hours it
 * qualifies. */
async function openHorario() {
  render(<SettingsPage />);
  await userEvent.click(await screen.findByRole("tab", { name: /Horario/i }));
  return screen.findByRole("switch", { name: /horas propuestas/i });
}

describe("SettingsPage — horario flexible", () => {
  it("la holgura queda deshabilitada con el toggle apagado y el guardado apagado sin cambios", async () => {
    await openHorario();
    expect(screen.getByLabelText(/Holgura de cierre/i)).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Guardar horario flexible/i }),
    ).toBeDisabled();
  });

  it("enciende el toggle, fija la holgura y el PATCH lleva EXACTAMENTE esos dos campos", async () => {
    const toggle = await openHorario();
    await userEvent.click(toggle);

    const grace = screen.getByLabelText(/Holgura de cierre/i);
    expect(grace).toBeEnabled();
    await userEvent.clear(grace);
    await userEvent.type(grace, "30");

    const save = screen.getByRole("button", { name: /Guardar horario flexible/i });
    expect(save).toBeEnabled();
    await userEvent.click(save);

    expect(api.updateBusinessConfig).toHaveBeenCalledTimes(1);
    expect(api.updateBusinessConfig.mock.calls[0][0]).toEqual({
      flexible_scheduling: true,
      closing_grace_minutes: 30,
    });
  });

  it("guardar la voz no arrastra la política de agenda (y viceversa)", async () => {
    // Same config row, three cards: each PATCH carries ONLY its own fields — the
    // guarantee that already keeps the voice card from undoing a tone change
    // (review 2026-07-27) has to hold for the scheduling card too.
    const toggle = await openHorario();
    await userEvent.click(toggle); // scheduling now dirty, NOT saved

    await userEvent.click(screen.getByRole("tab", { name: /Asistente/i }));
    const context = await screen.findByLabelText("Sobre tu negocio");
    await userEvent.clear(context);
    await userEvent.type(context, "Cortes clásicos.");
    await userEvent.click(screen.getByRole("button", { name: /Guardar mensajes/i }));

    expect(api.updateBusinessConfig).toHaveBeenCalledTimes(1);
    expect(Object.keys(api.updateBusinessConfig.mock.calls[0][0])).toEqual([
      "business_context",
    ]);
  });

  it("guardar la voz PRESERVA el estado sucio de la agenda en pantalla", async () => {
    // The wire guarantee above is not enough: feeding the server's FULL row into
    // `cfg` after a save silently reverted the other card's unsaved edits (the
    // server still has flexible_scheduling=false, so the toggle snapped off).
    // Review 2026-08-15, same family as the 2026-07-27 card-clobber incident.
    const toggle = await openHorario();
    await userEvent.click(toggle); // dirty, NOT saved

    await userEvent.click(screen.getByRole("tab", { name: /Asistente/i }));
    const context = await screen.findByLabelText("Sobre tu negocio");
    await userEvent.clear(context);
    await userEvent.type(context, "Cortes clásicos.");
    await userEvent.click(screen.getByRole("button", { name: /Guardar mensajes/i }));

    await userEvent.click(screen.getByRole("tab", { name: /Horario/i }));
    const toggleAfter = await screen.findByRole("switch", {
      name: /horas propuestas/i,
    });
    expect(toggleAfter).toBeChecked(); // still ON, still pending its own save
    expect(
      screen.getByRole("button", { name: /Guardar horario flexible/i }),
    ).toBeEnabled(); // still dirty
  });

  it("guardar la agenda con la voz sucia manda solo agenda y no borra lo tipeado", async () => {
    // The reverse direction is the expensive one: up to 4000 typed characters in
    // «Sobre tu negocio» must survive a save made from the Horario tab.
    render(<SettingsPage />);
    await userEvent.click(await screen.findByRole("tab", { name: /Asistente/i }));
    const context = await screen.findByLabelText("Sobre tu negocio");
    await userEvent.clear(context);
    await userEvent.type(context, "Texto sin guardar.");

    await userEvent.click(screen.getByRole("tab", { name: /Horario/i }));
    const toggle = await screen.findByRole("switch", { name: /horas propuestas/i });
    await userEvent.click(toggle);
    await userEvent.click(
      screen.getByRole("button", { name: /Guardar horario flexible/i }),
    );

    expect(api.updateBusinessConfig).toHaveBeenCalledTimes(1);
    expect(api.updateBusinessConfig.mock.calls[0][0]).toEqual({
      flexible_scheduling: true,
    });

    await userEvent.click(screen.getByRole("tab", { name: /Asistente/i }));
    expect(await screen.findByLabelText("Sobre tu negocio")).toHaveValue(
      "Texto sin guardar.",
    );
  });
});

/** La sección activa vive en la URL (?tab=) y la nav es una lista de secciones:
 * Horario partido en tres (Horario / Por profesional / Bloqueos) y WhatsApp
 * fusionado como card dentro de Asistente. */
describe("SettingsPage — navegación por secciones", () => {
  it("un ?tab= desconocido cae a Negocio", async () => {
    searchParamsStub.current = new URLSearchParams("tab=basura");
    render(<SettingsPage />);
    expect(await screen.findByLabelText("País")).toBeInTheDocument();
  });

  it("?tab=horario aterriza directo en la sección (deep-link)", async () => {
    searchParamsStub.current = new URLSearchParams("tab=horario");
    render(<SettingsPage />);
    expect(
      await screen.findByRole("switch", { name: /horas propuestas/i }),
    ).toBeInTheDocument();
  });

  it("clic en «Bloqueos» muestra su sección y escribe ?tab= en la URL", async () => {
    render(<SettingsPage />);
    await userEvent.click(await screen.findByRole("tab", { name: /Bloqueos/i }));
    expect(await screen.findByText("Bloqueos de horario")).toBeInTheDocument();
    expect(window.location.search).toContain("tab=bloqueos");
  });

  it("«Por profesional» renderiza su sección con el selector de profesionales", async () => {
    render(<SettingsPage />);
    await userEvent.click(await screen.findByRole("tab", { name: /Por profesional/i }));
    expect(await screen.findByText("Horario por profesional")).toBeInTheDocument();
    expect(screen.getByLabelText("Profesional")).toBeInTheDocument();
  });

  it("la card «Canal WhatsApp» vive dentro de Asistente y dice su estado", async () => {
    render(<SettingsPage />);
    await userEvent.click(await screen.findByRole("tab", { name: /Asistente/i }));
    expect(await screen.findByText("Canal WhatsApp")).toBeInTheDocument();
    // PET Spa todavía no conecta WhatsApp: el estado se dice, no se esconde.
    expect(screen.getByText("No conectado")).toBeInTheDocument();
  });

  it("sin plan de asistente quedan las secciones operativas y ?tab=asistente cae a Negocio", async () => {
    bizRef.current = {
      ...business,
      entitlements: { ...business.entitlements, assistant: false },
    };
    searchParamsStub.current = new URLSearchParams("tab=asistente");
    render(<SettingsPage />);
    // Fallback a Negocio: la sección gated no existe para este plan.
    expect(await screen.findByLabelText("País")).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent?.trim());
    expect(tabs).toEqual([
      "Negocio",
      "Horario",
      "Por profesional",
      "Bloqueos",
      "Equipo",
    ]);
  });
});

/** Garantías de la reestructura que el mock estático dejaba inverificables:
 * cabecera durante la carga, orientación vertical en desktop, el flujo
 * conectado de WhatsApp y la supervivencia de ediciones fuera de cfg. */
describe("SettingsPage — carga, escritorio y canal WhatsApp", () => {
  it("la cabecera se dibuja también mientras el contexto carga", () => {
    ctxStateRef.current = { state: "loading", error: null };
    bizRef.current = undefined;
    render(<SettingsPage />);
    // Reemplazar la página entera por el cargador desmontaba el control recién
    // usado y tiraba el foco al body — el defecto que motivó el cambio.
    expect(screen.getByRole("heading", { name: "Configuración" })).toBeInTheDocument();
    expect(screen.getByText("Cargando configuración…")).toBeInTheDocument();
  });

  it("un error del contexto muestra el ErrorState debajo de la cabecera", async () => {
    ctxStateRef.current = { state: "error", error: "Sin conexión con el backend" };
    bizRef.current = undefined;
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { name: "Configuración" })).toBeInTheDocument();
    expect(await screen.findByText("Sin conexión con el backend")).toBeInTheDocument();
  });

  it("en desktop (md+) las tabs pasan a nav lateral vertical", async () => {
    // El stub global del setup responde matches:false (móvil); este caso
    // necesita el otro lado del breakpoint.
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    try {
      render(<SettingsPage />);
      await screen.findByLabelText("País");
      expect(document.querySelector('[data-slot="tabs"]')).toHaveAttribute(
        "data-orientation",
        "vertical",
      );
    } finally {
      window.matchMedia = original;
    }
  });

  it("clic en «Notificaciones» abre su sección", async () => {
    // Tres strings deben coincidir en runtime (visibleTabs, trigger, panel):
    // sin este test, un typo dejaba la sección huérfana con la suite en verde.
    render(<SettingsPage />);
    await userEvent.click(await screen.findByRole("tab", { name: /Notificaciones/i }));
    expect(await screen.findByText("Sonidos de notificación")).toBeInTheDocument();
  });

  it("con WhatsApp conectado la card muestra número, plantillas y su estado", async () => {
    bizRef.current = {
      ...business,
      whatsapp_connected: true,
      whatsapp_number: "+56 9 1234 5678",
    };
    whatsappApi.listTemplates.mockResolvedValue({
      items: [
        {
          name: "recordatorio_cita_v1",
          catalog_key: "recordatorio_cita",
          status: "approved",
        },
      ],
      synced: true,
    });
    render(<SettingsPage />);
    await userEvent.click(await screen.findByRole("tab", { name: /Asistente/i }));
    expect(
      await screen.findByText("Número vinculado: +56 9 1234 5678"),
    ).toBeInTheDocument();
    // El nombre crudo solo existe en la fila de la plantilla («Recordatorio de
    // cita» aparece además en la lista explicativa de arriba).
    expect(await screen.findByText("recordatorio_cita_v1")).toBeInTheDocument();
    expect(screen.getByText("Aprobada")).toBeInTheDocument();
    expect(whatsappApi.listTemplates).toHaveBeenCalledTimes(1);
  });

  it("lo tipeado en Negocio sobrevive un paseo por otra sección", async () => {
    // El estado vive lifted en SettingsContent y los paneles inactivos se
    // desmontan: esta garantía ya estaba fijada para cfg, no para el resto.
    render(<SettingsPage />);
    const nombre = await screen.findByLabelText("Nombre");
    await userEvent.clear(nombre);
    await userEvent.type(nombre, "PET Spa Deluxe");

    await userEvent.click(screen.getByRole("tab", { name: /Bloqueos/i }));
    await screen.findByText("Bloqueos de horario");

    await userEvent.click(screen.getByRole("tab", { name: /Negocio/i }));
    expect(await screen.findByLabelText("Nombre")).toHaveValue("PET Spa Deluxe");
  });
});

// TeamManagement (tab «Equipo») necesita sesión y el client de users.
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "owner@a.cl", name: "Owner", role: "owner" },
  }),
}));
vi.mock("@/lib/api/users", () => ({
  listUsers: vi.fn().mockResolvedValue([]),
  inviteUser: vi.fn(),
  deleteUser: vi.fn(),
  activateUser: vi.fn(),
}));

describe("SettingsPage — tab Equipo", () => {
  it("la pestaña Equipo abre de verdad (regresión: faltaba en visibleTabs y el click caía a Negocio)", async () => {
    render(<SettingsPage />);

    await userEvent.click(await screen.findByRole("tab", { name: /Equipo/i }));

    // Contenido real de la tab, no solo el trigger: el bug dejaba el trigger
    // visible pero el click re-seleccionaba «Negocio».
    expect(
      await screen.findByRole("button", { name: /Invitar usuario/i }),
    ).toBeInTheDocument();
  });
});

/** Cambio remoto (auditoría 2026-08-20): el form NUNCA se re-hidrata solo — al
 * detectar que la config cambió en otra sesión muestra una franja con
 * «Recargar». La detección es por VALOR (huella de los campos hidratados):
 * `Business` no trae updated_at y cada guardado propio produce dos ecos. */
describe("SettingsPage — cambió en otra sesión", () => {
  it("muestra la franja ante un cambio remoto y Recargar aplica el estado nuevo", async () => {
    render(<SettingsPage />);
    await screen.findByLabelText("Nombre");

    bizRef.current = { ...business, name: "PET Spa Renovado" };
    // Un re-render entrega el negocio nuevo al detector (en producción lo
    // provoca el refetch del contexto por negocio_actualizado).
    await userEvent.click(screen.getByRole("tab", { name: /Horario/i }));

    expect(await screen.findByText(/cambió en otra sesión/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Recargar" }));
    await userEvent.click(screen.getByRole("tab", { name: /Negocio/i }));
    expect(await screen.findByLabelText("Nombre")).toHaveValue("PET Spa Renovado");
    expect(screen.queryByText(/cambió en otra sesión/i)).not.toBeInTheDocument();
  });

  it("una referencia nueva con los MISMOS valores no enciende la franja", async () => {
    render(<SettingsPage />);
    await screen.findByLabelText("Nombre");

    bizRef.current = { ...business };
    await userEvent.click(screen.getByRole("tab", { name: /Horario/i }));
    await screen.findByRole("switch", { name: /horas propuestas/i });

    expect(screen.queryByText(/cambió en otra sesión/i)).not.toBeInTheDocument();
  });

  it("el eco del propio guardado no enciende la franja", async () => {
    render(<SettingsPage />);
    const nombre = await screen.findByLabelText("Nombre");
    await userEvent.clear(nombre);
    await userEvent.type(nombre, "PET Spa Deluxe");
    await userEvent.click(screen.getByRole("button", { name: /Guardar negocio/i }));
    await screen.findByText("Guardado");

    // El refetch del contexto entrega el MISMO estado que devolvió el PATCH.
    bizRef.current = { ...business, name: "PET Spa Deluxe" };
    await userEvent.click(screen.getByRole("tab", { name: /Horario/i }));
    await screen.findByRole("switch", { name: /horas propuestas/i });

    expect(screen.queryByText(/cambió en otra sesión/i)).not.toBeInTheDocument();
  });
});
