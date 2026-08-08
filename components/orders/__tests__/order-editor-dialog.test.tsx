import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { searchProducts, type Order } from "@/lib/api";
import type { Product } from "@/lib/types";

import { OrderEditorDialog } from "../order-editor-dialog";

vi.mock("@/lib/api");
// El diálogo formatea plata con la moneda del negocio; sin el provider `useMoney` cae a CLP,
// que es lo que se afirma abajo.
vi.mock("@/lib/business", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/business")>()),
  useBusinessOptional: () => null,
}));

const CERA: Product = {
  id: "p1",
  name: "Cera y Pomada - Volumen Powder (Inmortal)",
  price: 17000,
  stock: 25,
  sellable_via_whatsapp: true,
  is_active: true,
};
const GIFT: Product = {
  id: "p2",
  name: "Gift Card Oro",
  price: 30000,
  stock: 50,
  sellable_via_whatsapp: true,
  is_active: true,
};

function makeOrder(over: Partial<Order> = {}): Order {
  return {
    id: "o1",
    customer: "Arévalo Araque",
    customer_id: "c1",
    status: "draft",
    total: 17000,
    items: [
      { product_id: "p1", product_name: CERA.name, quantity: 1, unit_price: 17000 },
    ],
    created_at: "2026-07-31T10:00:00Z",
    ...over,
  } as Order;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(searchProducts).mockResolvedValue({ items: [CERA, GIFT], count: 2 });
});

function renderEditor(order: Order | null = makeOrder()) {
  return render(
    <OrderEditorDialog open order={order} onOpenChange={vi.fn()} onSaved={vi.fn()} />,
  );
}

describe("OrderEditorDialog — la plata del pedido a la vista", () => {
  it("muestra el subtotal de cada línea y el total", async () => {
    renderEditor();
    // El operador está armando un pedido con plata: no verla mientras lo construye era la
    // parte incómoda de este formulario, no solo el ancho.
    await waitFor(() =>
      expect(screen.getAllByText("$17.000").length).toBeGreaterThan(0),
    );
    expect(screen.getByText("Total")).toBeTruthy();
  });

  it("recalcula el subtotal al cambiar la cantidad, y con él el total", async () => {
    renderEditor();
    const qty = await screen.findByLabelText("Cantidad");
    await userEvent.clear(qty);
    await userEvent.type(qty, "3");
    // 3 × $17.000
    await waitFor(() =>
      expect(screen.getAllByText("$51.000").length).toBeGreaterThan(0),
    );
  });

  it("no inventa un $0 en una línea sin producto elegido", async () => {
    renderEditor(makeOrder({ items: [] }));
    // La FILA muestra «—»: un cero ahí se leería como «este producto es gratis».
    await waitFor(() => expect(screen.getByText("—")).toBeTruthy());
    // El TOTAL sí es $0, y eso es correcto: la suma de nada es cero. No es un valor
    // ausente disfrazado de cero (ese es el caso del rating), es una suma real.
    const total = screen.getByText("Total").parentElement;
    expect(total?.textContent).toContain("$0");
  });

  it("trata una cantidad inválida como 0 en lugar de romper el total", async () => {
    renderEditor();
    const qty = await screen.findByLabelText("Cantidad");
    await userEvent.clear(qty);
    // Un input vacío daba NaN, y `NaN` propagado al total lo mostraba como «$NaN».
    await waitFor(() => expect(screen.getByText("Total")).toBeTruthy());
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it("en el trigger muestra solo el NOMBRE del producto", async () => {
    renderEditor();
    // El precio vive en las opciones del desplegable y en la columna Subtotal. Llevarlo
    // también en el trigger no cabía y se cortaba a mitad del número («$17.00(»).
    const trigger = await screen.findByText(CERA.name);
    expect(trigger.textContent).not.toContain("$17.000");
  });
});
