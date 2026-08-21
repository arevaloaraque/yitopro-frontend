/**
 * Tests for the /reports page — the owner-only value report.
 *
 * MSW intercepts the real HTTP (pattern from app/login/__tests__/page.test.tsx):
 * nothing in lib/api is mocked — the wire shape is what gets pinned.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/lib/auth";
import { BusinessProvider } from "@/lib/business";
import { server } from "@/mocks/server";

import ReportsPage from "../page";

const BASE = "http://localhost:8050/api";

// ── next/navigation + SSE mocks ───────────────────────────────────────────────

const mockReplace = vi.fn();

const { searchParamsStub } = vi.hoisted(() => ({
  searchParamsStub: { current: new URLSearchParams() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => searchParamsStub.current,
}));

// BusinessProvider se suscribe al stream SSE al montar: en tests no hay stream.
vi.mock("@/lib/sse", () => ({
  subscribeToEvents: () => () => {},
}));

// ── fixtures (forma del backend: id int, active, Decimales string) ────────────

/** Alta del negocio hace 40 días, RELATIVA a hoy.
 *
 *  Relativa y no fija porque una fecha fija se vuelve una bomba de tiempo: lo que
 *  estos tests fijan es que la ventana CUBRA la vida del negocio, y con 40 días
 *  de vida contra los 90 del preset por defecto se cumple.
 *
 *  Consecuencia del tope de 90 días que conviene no descubrir por sorpresa: en un
 *  negocio de MÁS de 90 días la frase de bienvenida ya no puede aparecer nunca, y
 *  es correcto — con una ventana de 90 días no se puede afirmar nada sobre toda la
 *  vida de un tenant más viejo. */
const LIFETIME_DAYS = 40;
const signupIso = new Date(Date.now() - (LIFETIME_DAYS - 1) * 86_400_000).toISOString();

const backendBusiness = {
  id: 3,
  name: "Caribbean Barbershop",
  country: "CL",
  address: "",
  currency: "CLP",
  language: "es",
  timezone: "America/Santiago",
  active: true,
  is_operative: true,
  whatsapp_connected: true,
  whatsapp_number: "+56 9 1111 2222",
  onboarding_status: "completed",
  assistant_config: { display_name: "Maya", tone: "friendly", welcome_message: "" },
  created_at: signupIso,
};

type AgendaFixture = {
  ai_active_count: number | null;
  by_professional: { id: number; name: string; scheduled: number }[] | null;
  by_service: { id: number; name: string; scheduled: number }[] | null;
};

const DEFAULT_AGENDA: AgendaFixture = {
  ai_active_count: 1,
  by_professional: [
    { id: 7, name: "Anyelo", scheduled: 4 },
    { id: 9, name: "Yitzon", scheduled: 1 },
  ],
  by_service: [
    { id: 21, name: "Corte", scheduled: 3 },
    { id: 22, name: "Barba", scheduled: 2 },
  ],
};

const DEFAULT_CUSTOMERS = {
  average: 2.5,
  rated: 4,
  pending: 1,
  distribution: [
    { stars: 1, conversations: 1 },
    { stars: 2, conversations: 2 },
    { stars: 3, conversations: 0 },
    { stars: 4, conversations: 0 },
    { stars: 5, conversations: 1 },
  ],
};

const DEFAULT_PRODUCTS = {
  top: [
    { id: 69, name: "Cera y Pomada", units: 6, orders: 5 },
    { id: 68, name: "Gift Card Plata", units: 3, orders: 3 },
  ],
};

function makeSummary(over: {
  replies?: { ai: number; operator: number };
  appointments?: AgendaFixture | null;
  orders?: { ai_confirmed_count: number } | null;
  products?: typeof DEFAULT_PRODUCTS | null;
  customers?: typeof DEFAULT_CUSTOMERS | null;
  payments?: unknown;
}) {
  return {
    core: {
      replies: over.replies ?? { ai: 154, operator: 1 },
      handoffs: {
        total: 9,
        resolved: 9,
        by_trigger: { ai: 4, customer: 4, rule: 1, timeout: 0 },
      },
      response_time: { median_s: 6.1, p90_s: 14.2, n: 40, n_total: 45, cutoff_s: 300 },
      out_of_hours: { inbound_outside: 12, schedule_configured: true },
      ai_activity: { calls: 122, errors: 2 },
    },
    blocks: {
      appointments:
        over.appointments === undefined ? DEFAULT_AGENDA : over.appointments,
      orders: over.orders === undefined ? { ai_confirmed_count: 6 } : over.orders,
      products: over.products === undefined ? DEFAULT_PRODUCTS : over.products,
      customers: over.customers === undefined ? DEFAULT_CUSTOMERS : over.customers,
      payments:
        over.payments === undefined
          ? {
              series: [
                {
                  day: "2026-08-03",
                  currency: "CLP",
                  paid_amount: "5000.00",
                  paid_count: 1,
                },
                {
                  day: "2026-08-04",
                  currency: "USD",
                  paid_amount: "100.00",
                  paid_count: 2,
                },
              ],
              totals: [
                { currency: "CLP", paid_amount: "95000.00", paid_count: 8 },
                { currency: "USD", paid_amount: "100.00", paid_count: 2 },
              ],
              previous: [
                { currency: "CLP", paid_amount: "50000.00", paid_count: 5 },
                { currency: "USD", paid_amount: "0.00", paid_count: 0 },
              ],
              composition: [
                { kind: "order", currency: "CLP", amount: "67000.00", count: 5 },
                { kind: "appointment", currency: "CLP", amount: "28000.00", count: 3 },
                { kind: "standalone", currency: "USD", amount: "60.00", count: 2 },
              ],
              links: { created: 12, opened: 10, paid: 8 },
            }
          : over.payments,
    },
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <AuthProvider>
      <BusinessProvider>
        <ReportsPage />
      </BusinessProvider>
    </AuthProvider>,
  );
}

/** Sesión autenticada de dueño + negocio cargado; el summary queda a cada test. */
function mockOwnerSession() {
  server.use(
    http.post(`${BASE}/auth/refresh/`, () =>
      HttpResponse.json({
        access_token: "jwe-boot",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    ),
    http.get(`${BASE}/auth/me/`, () =>
      HttpResponse.json({
        id: "u1",
        email: "owner@caribbean.cl",
        name: "Dueño",
        role: "owner",
      }),
    ),
    http.get(`${BASE}/businesses/me/`, () => HttpResponse.json(backendBusiness)),
  );
}

function mockSummary(body: object, status = 200) {
  server.use(
    http.get(`${BASE}/reports/value-summary/`, () =>
      HttpResponse.json(body, { status }),
    ),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParamsStub.current = new URLSearchParams();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe("/reports page", () => {
  it("con summary completo: tira + 3 bloques, y cada total con el símbolo de SU moneda", async () => {
    mockOwnerSession();
    mockSummary(makeSummary({}));
    renderPage();

    // Tira del núcleo.
    expect(await screen.findByText("Respuestas del asistente")).toBeInTheDocument();
    expect(screen.getByText("de 155 respuestas enviadas en total")).toBeInTheDocument();
    expect(screen.getByText("Derivaciones a una persona")).toBeInTheDocument();
    // Sin pendientes, el subtitulo nombra el motivo de la escalacion. El
    // fixture empata `ai` y `customer` en 4, y con empate NO se corona a
    // ninguno: el orden de las claves lo decide el backend, no el negocio.
    expect(
      screen.getByText("todas atendidas · por varios motivos"),
    ).toBeInTheDocument();
    // La mediana es el número grande; el subtítulo NO la repite y sí trae el
    // p90 y la base sobre la que se calcula.
    expect(screen.getByText("6,1 s")).toBeInTheDocument();
    expect(
      screen.getByText(/p90 14,2 s · base: 40 de 45 bajo <5 min/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/mediana 6,1 s/)).not.toBeInTheDocument();

    // Los 3 bloques de dominio.
    expect(screen.getByRole("heading", { name: "Agenda" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pedidos" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cobros" })).toBeInTheDocument();

    // Dos monedas → dos totales, nunca sumados: cada uno con SU símbolo.
    expect(screen.getByText("$95.000")).toBeInTheDocument();
    expect(screen.getByText("US$100")).toBeInTheDocument();

    // Conversión de enlaces: un embudo de tres pasos, cada uno con su conteo y
    // su porcentaje en TEXTO — la barra acompaña al dato, no lo reemplaza.
    expect(
      screen.getByRole("heading", { name: "Enlaces de cobro" }),
    ).toBeInTheDocument();
    for (const step of ["Enviados", "Abiertos", "Pagados"]) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    expect(screen.getByText("83%")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
  });

  it("derivaciones: con un motivo dominante lo nombra; el pendiente manda sobre el total", async () => {
    mockOwnerSession();
    const summary = makeSummary({});
    summary.core.handoffs = {
      total: 9,
      resolved: 9,
      by_trigger: { ai: 2, customer: 6, rule: 1, timeout: 0 },
    };
    mockSummary(summary);
    const { unmount } = renderPage();

    expect(
      await screen.findByText("todas atendidas · sobre todo, lo pidió el cliente"),
    ).toBeInTheDocument();
    unmount();

    // Con derivaciones abiertas, lo accionable es cuántas siguen esperando:
    // «41 de 46 atendidas» escondía ese número en positivo.
    const pendings = makeSummary({});
    pendings.core.handoffs = {
      total: 9,
      resolved: 7,
      by_trigger: { ai: 2, customer: 6, rule: 1, timeout: 0 },
    };
    mockSummary(pendings);
    renderPage();

    expect(
      await screen.findByText("2 siguen esperando a una persona"),
    ).toBeInTheDocument();
  });

  it("con blocks.appointments null el bloque no existe en el DOM", async () => {
    mockOwnerSession();
    mockSummary(makeSummary({ appointments: null }));
    renderPage();

    expect(await screen.findByRole("heading", { name: "Pedidos" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Agenda" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cobros" })).toBeInTheDocument();
  });

  it("agenda: dos rankings con su conteo y el selector de profesional", async () => {
    mockOwnerSession();
    mockSummary(makeSummary({}));
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Citas agendadas por profesional" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Citas agendadas por servicio" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Anyelo")).toBeInTheDocument();
    expect(screen.getByText("Yitzon")).toBeInTheDocument();
    expect(screen.getByText("Corte")).toBeInTheDocument();
    // Dos profesionales → el selector aparece, en la cabecera de la tarjeta.
    expect(screen.getByLabelText("Filtrar por profesional")).toBeInTheDocument();
    // Nunca «atendidas»: el backend no sabe quién asistió.
    expect(screen.queryByText(/atendidas por/i)).not.toBeInTheDocument();
  });

  it("agenda con un solo profesional: sin selector (un desplegable de una opción es ruido)", async () => {
    mockOwnerSession();
    mockSummary(
      makeSummary({
        appointments: {
          ...DEFAULT_AGENDA,
          by_professional: [{ id: 7, name: "Anyelo", scheduled: 4 }],
        },
      }),
    );
    renderPage();

    expect(await screen.findByText("Anyelo")).toBeInTheDocument();
    expect(screen.queryByLabelText("Filtrar por profesional")).not.toBeInTheDocument();
  });

  it("agenda con gates cruzados: rankings null y ai_active_count vivo, y al revés", async () => {
    mockOwnerSession();
    mockSummary(
      makeSummary({
        appointments: { ...DEFAULT_AGENDA, by_professional: null, by_service: null },
      }),
    );
    const { unmount } = renderPage();

    expect(await screen.findByRole("heading", { name: "Agenda" })).toBeInTheDocument();
    expect(screen.getByText(/El asistente agendó/)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Citas agendadas por profesional" }),
    ).not.toBeInTheDocument();
    unmount();

    // Negocio que agenda solo desde el panel: nunca tuvo cita de IA, pero su
    // reparto sí existe. La tarjeta de la IA desaparece, el ranking no.
    mockSummary(
      makeSummary({ appointments: { ...DEFAULT_AGENDA, ai_active_count: null } }),
    );
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Citas agendadas por profesional" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/El asistente agendó/)).not.toBeInTheDocument();
  });

  it("con replies en cero y ventana de toda la vida: la frase de bienvenida", async () => {
    mockOwnerSession();
    mockSummary(
      makeSummary({
        replies: { ai: 0, operator: 0 },
        appointments: null,
        orders: null,
        payments: null,
      }),
    );
    renderPage();

    expect(
      await screen.findByText("Tu asistente todavía no ha atendido a nadie"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`En ${LIFETIME_DAYS} días con yitopro`)),
    ).toBeInTheDocument();

    // Sin tarjetas en cero: ni la tira ni bloques.
    expect(screen.queryByText("Respuestas del asistente")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Agenda" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Pedidos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Cobros" })).not.toBeInTheDocument();
  });

  it("con replies en cero en una ventana de 7 días: vacío del período, NO la frase de bienvenida", async () => {
    // La regresión: la frase ancla en la vida del negocio («en tus N días») y
    // el cero es de la semana. A un negocio de 40 días tras una semana
    // tranquila le decía que nunca había atendido a nadie.
    searchParamsStub.current = new URLSearchParams("p=7");
    mockOwnerSession();
    mockSummary(makeSummary({ replies: { ai: 0, operator: 0 } }));
    renderPage();

    expect(
      await screen.findByText("Sin respuestas en este período"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Tu asistente todavía no ha atendido a nadie"),
    ).not.toBeInTheDocument();
  });

  it("con replies en cero pero cobros reales: los bloques siguen en pantalla", async () => {
    // Un período sin mensajes puede tener dinero cobrado. Esconderlo porque
    // nadie escribió es perder el dato que sí existe.
    mockOwnerSession();
    mockSummary(makeSummary({ replies: { ai: 0, operator: 0 } }));
    renderPage();

    expect(await screen.findByRole("heading", { name: "Cobros" })).toBeInTheDocument();
    expect(screen.getByText("$95.000")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Agenda" })).toBeInTheDocument();
    expect(screen.queryByText("Respuestas del asistente")).not.toBeInTheDocument();
  });

  it("con previous.paid_count = 1: «sin período comparable» y por qué", async () => {
    mockOwnerSession();
    const summary = makeSummary({});
    (summary.blocks.payments as { previous: unknown }).previous = [
      { currency: "CLP", paid_amount: "12000.00", paid_count: 1 },
      { currency: "USD", paid_amount: "0.00", paid_count: 0 },
    ];
    mockSummary(summary);
    renderPage();

    // El texto DISCRIMINANTE: la fila USD ya aportaría «sin período comparable»
    // por sí sola (0 cobros previos), así que afirmarlo a secas pasaría aunque
    // el piso de CLP no funcionara. El «1 cobro» solo puede venir de CLP.
    expect(
      await screen.findByText(/base insuficiente: 1 cobro en los \d+ días anteriores/),
    ).toBeInTheDocument();
  });

  it("con previous.paid_count = 5: muestra el % y dice contra qué compara", async () => {
    mockOwnerSession();
    // El fixture por defecto ya trae CLP previous con 5 cobros de $50.000
    // contra $95.000 actuales → +90%.
    mockSummary(makeSummary({}));
    renderPage();

    // El porcentaje vive en su propio chip (con flecha, para no depender del
    // color), asi que el texto ya no es un unico nodo.
    expect(await screen.findByText("+90%")).toBeInTheDocument();
    expect(
      screen.getByText(/vs los \d+ días anteriores \(5 cobros\)/),
    ).toBeInTheDocument();
  });

  it("clientes: rótulo de CONDUCTA (no satisfacción), promedio, base y distribución", async () => {
    mockOwnerSession();
    mockSummary(makeSummary({}));
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Cómo te escriben tus clientes" }),
    ).toBeInTheDocument();
    // El rótulo es lo que impide leer 2,5 como «servicio malo»: la escala mide
    // el trato del CLIENTE y la tarjeta está obligada a decirlo.
    expect(screen.getByText(/No mide tu servicio/)).toBeInTheDocument();
    expect(screen.getByText("2,5")).toBeInTheDocument();
    expect(
      screen.getByText(/sobre 4 conversaciones con nota · 1 en espera/),
    ).toBeInTheDocument();
    // Los cinco escalones se dibujan, también los que valen cero: la forma ES el dato.
    for (const label of [
      "Hostil o puro ruido",
      "Poco colaborativo",
      "Interacción normal",
      "Claro y colaborativo",
      "Excelente",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("clientes: sin notas en el período dice cuántas esperan, no un promedio inventado", async () => {
    mockOwnerSession();
    mockSummary(
      makeSummary({
        customers: {
          average: null,
          rated: 0,
          pending: 3,
          distribution: [1, 2, 3, 4, 5].map((stars) => ({ stars, conversations: 0 })),
        } as unknown as typeof DEFAULT_CUSTOMERS,
      }),
    );
    renderPage();

    expect(
      await screen.findByText(
        /Ninguna conversación de este período tiene nota todavía: 3 están/,
      ),
    ).toBeInTheDocument();
  });

  it("productos: ranking en unidades con el número de pedidos", async () => {
    mockOwnerSession();
    mockSummary(makeSummary({}));
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Lo más vendido" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cera y Pomada")).toBeInTheDocument();
    expect(screen.getByText("en 5 pedidos")).toBeInTheDocument();
    expect(
      screen.getByText(/Unidades vendidas en pedidos confirmados/),
    ).toBeInTheDocument();
    // Unidades, NUNCA dinero, y se comprueba dentro de la tarjeta: el pedido no
    // tiene columna de moneda, así que un importe aquí llevaría el símbolo de
    // hoy sobre precios congelados hace meses.
    const card = screen
      .getByRole("heading", { name: "Lo más vendido" })
      .closest("[data-slot=card]") as HTMLElement;
    expect(card.textContent).not.toMatch(/[$€]|US\$/);
  });

  it("con products y customers null ninguna de las dos tarjetas existe", async () => {
    mockOwnerSession();
    mockSummary(makeSummary({ products: null, customers: null }));
    renderPage();

    expect(await screen.findByRole("heading", { name: "Cobros" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Lo más vendido" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Cómo te escriben tus clientes" }),
    ).not.toBeInTheDocument();
  });

  it("ranking largo: colapsa en 3 y ofrece el resto", async () => {
    // El caso que faltaba: con quince profesionales, cinco filas y ninguna
    // pista de que el resto existe.
    mockOwnerSession();
    mockSummary(
      makeSummary({
        appointments: {
          ...DEFAULT_AGENDA,
          by_professional: Array.from({ length: 12 }, (_, i) => ({
            id: 100 + i,
            name: `Profesional ${String(i + 1).padStart(2, "0")}`,
            scheduled: 20 - i,
          })),
        },
      }),
    );
    renderPage();

    expect(await screen.findByText("Profesional 01")).toBeInTheDocument();
    expect(screen.getByText("Profesional 03")).toBeInTheDocument();
    expect(screen.queryByText("Profesional 04")).not.toBeInTheDocument();

    // 12 filas, 3 visibles → el botón nombra las 9 que faltan.
    const more = screen.getByRole("button", { name: /Ver 9 más/ });
    expect(more).toHaveAttribute("aria-expanded", "false");
    more.click();
    expect(await screen.findByText("Profesional 12")).toBeInTheDocument();
  });

  it("rango personalizado: un par inválido muestra el motivo y NO pide datos", async () => {
    searchParamsStub.current = new URLSearchParams(
      "p=custom&from=2026-08-10&to=2026-08-01",
    );
    mockOwnerSession();
    let calls = 0;
    server.use(
      http.get(`${BASE}/reports/value-summary/`, () => {
        calls += 1;
        return HttpResponse.json(makeSummary({}));
      }),
    );
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "La fecha final es anterior a la inicial.",
    );
    expect(calls).toBe(0);
  });

  it("rango personalizado: 91 días avisa del tope y NO pide datos; 90 sí", async () => {
    // El tope del rango a mano (90) es MÁS BAJO que el del backend (366): un
    // preset es finito y conocido, un rango libre es el que un operador puede
    // hacer enorme sin querer.
    searchParamsStub.current = new URLSearchParams(
      "p=custom&from=2026-03-01&to=2026-05-30",
    );
    mockOwnerSession();
    let calls = 0;
    server.use(
      http.get(`${BASE}/reports/value-summary/`, () => {
        calls += 1;
        return HttpResponse.json(makeSummary({}));
      }),
    );
    const { unmount } = renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El rango no puede superar 90 días.",
    );
    expect(calls).toBe(0);
    unmount();

    // 90 días inclusivos: el borde exacto entra.
    searchParamsStub.current = new URLSearchParams(
      "p=custom&from=2026-03-01&to=2026-05-29",
    );
    renderPage();
    await screen.findByRole("heading", { name: "Cobros" });
    expect(calls).toBe(1);
  });

  it("rango personalizado válido: la ventana viaja tal cual al backend", async () => {
    searchParamsStub.current = new URLSearchParams(
      "p=custom&from=2026-08-01&to=2026-08-07",
    );
    mockOwnerSession();
    let seen: URL | null = null;
    server.use(
      http.get(`${BASE}/reports/value-summary/`, ({ request }) => {
        seen = new URL(request.url);
        return HttpResponse.json(makeSummary({}));
      }),
    );
    renderPage();

    await screen.findByRole("heading", { name: "Cobros" });
    expect(seen!.searchParams.get("date_from")).toBe("2026-08-01");
    expect(seen!.searchParams.get("date_to")).toBe("2026-08-07");
    expect(screen.getByText(/2026-08-01 → 2026-08-07 \(7 días\)/)).toBeInTheDocument();
  });

  it("403 del backend: ErrorState con el mensaje del backend, sin retry", async () => {
    mockOwnerSession();
    mockSummary({ detail: "Solo el dueño puede ver los reportes." }, 403);
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Solo el dueño puede ver los reportes.");
    expect(
      screen.queryByRole("button", { name: /reintentar/i }),
    ).not.toBeInTheDocument();
  });

  it("staff: redirige a /dashboard", async () => {
    server.use(
      http.post(`${BASE}/auth/refresh/`, () =>
        HttpResponse.json({
          access_token: "jwe-boot",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      ),
      http.get(`${BASE}/auth/me/`, () =>
        HttpResponse.json({
          id: "u2",
          email: "staff@caribbean.cl",
          name: "Staff",
          role: "staff",
        }),
      ),
      http.get(`${BASE}/businesses/me/`, () => HttpResponse.json(backendBusiness)),
    );
    renderPage();

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard"));
  });
});
