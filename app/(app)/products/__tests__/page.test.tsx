/**
 * Products page — el contrato que se rompió durante meses en silencio.
 *
 * Lo que se fija aquí es lo que no se ve mirando la pantalla: que `description`
 * VIAJA (el agente de WhatsApp busca el catálogo por nombre Y descripción, así
 * que un producto sin ella es un producto que la IA no encuentra), que el filtro
 * de estado se siembra de la URL y llega al servidor, que el término de búsqueda
 * se publica ya retrasado, que recargar no encoge una lista con varias páginas
 * dentro, y que una respuesta que llega tarde no pisa a la vigente.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Paginated, Product, SSEEvent } from "@/lib/types";
import { searchProducts, createProduct, listProductCategories } from "@/lib/api";

import ProductsPage from "../page";

vi.mock("@/lib/api");

const { sseHandlers } = vi.hoisted(() => ({
  sseHandlers: [] as ((event: SSEEvent) => void)[],
}));
vi.mock("@/lib/sse", () => ({
  subscribeToEvents: (handler: (event: SSEEvent) => void) => {
    sseHandlers.push(handler);
    return () => {};
  },
}));

const { searchParamsStub } = vi.hoisted(() => ({
  searchParamsStub: { current: new URLSearchParams() },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsStub.current,
}));

function makeProduct(over: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Shampoo hipoalergénico",
    description: "Sin sulfatos, para pieles sensibles",
    price: 8990,
    stock: 5,
    sellable_via_whatsapp: true,
    is_active: true,
    category_name: "Higiene",
    ...over,
  };
}

const CATEGORIES = [
  { id: "1", name: "Alimento" },
  { id: "2", name: "Accesorios" },
];

beforeEach(() => {
  vi.clearAllMocks();
  sseHandlers.length = 0;
  searchParamsStub.current = new URLSearchParams();
  window.history.replaceState(null, "", "/products");
  vi.mocked(searchProducts).mockResolvedValue({
    items: [makeProduct()],
    count: 1,
  });
  vi.mocked(createProduct).mockResolvedValue(makeProduct({ id: "p2" }));
  vi.mocked(listProductCategories).mockResolvedValue(CATEGORIES);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProductsPage — descripción (PROD-3)", () => {
  it("manda la descripción al crear: es lo que el agente lee para vender", async () => {
    const user = userEvent.setup();
    render(<ProductsPage />);
    await screen.findByText("Shampoo hipoalergénico");

    await user.click(screen.getByRole("button", { name: "Nuevo producto" }));
    await user.type(screen.getByLabelText("Nombre"), "Cepillo doble");
    await user.type(screen.getByLabelText("Precio"), "4990");
    await user.type(
      screen.getByLabelText("Descripción (opcional)"),
      "Cerdas suaves para pelo largo",
    );
    await user.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() => expect(createProduct).toHaveBeenCalledTimes(1));
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Cepillo doble",
        description: "Cerdas suaves para pelo largo",
      }),
    );
  });

  it("precarga la descripción existente al editar, en vez de borrarla al guardar", async () => {
    const user = userEvent.setup();
    render(<ProductsPage />);
    await screen.findByText("Shampoo hipoalergénico");

    await user.click(
      screen.getByRole("button", { name: "Editar Shampoo hipoalergénico" }),
    );
    expect(screen.getByLabelText("Descripción (opcional)")).toHaveValue(
      "Sin sulfatos, para pieles sensibles",
    );
  });
});

describe("ProductsPage — filtros (PROD-1, PROD-6)", () => {
  it("siembra el filtro de estado desde la URL y lo manda al servidor", async () => {
    searchParamsStub.current = new URLSearchParams("active=false");
    render(<ProductsPage />);

    await waitFor(() => expect(searchProducts).toHaveBeenCalled());
    expect(searchProducts).toHaveBeenCalledWith(
      expect.objectContaining({ active: false, offset: 0 }),
    );
  });

  it("sin filtros no manda `active`: «todos» no es un filtro", async () => {
    render(<ProductsPage />);

    await waitFor(() => expect(searchProducts).toHaveBeenCalled());
    expect(searchProducts).toHaveBeenCalledWith(
      expect.objectContaining({ active: undefined }),
    );
  });

  it("publica en la URL el término ya retrasado, no cada pulsación", async () => {
    const user = userEvent.setup();
    render(<ProductsPage />);
    await screen.findByText("Shampoo hipoalergénico");

    await user.type(screen.getByLabelText("Buscar"), "cepi");

    await waitFor(() =>
      expect(searchProducts).toHaveBeenCalledWith(
        expect.objectContaining({ search: "cepi" }),
      ),
    );
    expect(new URLSearchParams(window.location.search).get("q")).toBe("cepi");
    // Cuatro teclas, una sola request de búsqueda además de la inicial.
    expect(vi.mocked(searchProducts).mock.calls.length).toBeLessThanOrEqual(2);
  });

  it("con filtro puesto y cero filas ofrece limpiar; sin filtros ofrece crear", async () => {
    vi.mocked(searchProducts).mockResolvedValue({ items: [], count: 0 });
    searchParamsStub.current = new URLSearchParams("active=false");
    const { unmount } = render(<ProductsPage />);

    expect(await screen.findByText("Sin resultados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Limpiar filtros" })).toBeInTheDocument();
    unmount();

    searchParamsStub.current = new URLSearchParams();
    window.history.replaceState(null, "", "/products");
    render(<ProductsPage />);
    expect(await screen.findByText("Sin productos")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Limpiar filtros" }),
    ).not.toBeInTheDocument();
  });
});

describe("ProductsPage — categorías", () => {
  it("siembra la categoría desde la URL, la manda como texto y la muestra por nombre", async () => {
    searchParamsStub.current = new URLSearchParams("category_id=2");
    render(<ProductsPage />);

    await waitFor(() =>
      expect(searchProducts).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: "2", offset: 0 }),
      ),
    );
    // El disparador dice «Accesorios», no «2»: el id nunca se le muestra a nadie.
    expect(await screen.findByLabelText("Categoría")).toHaveTextContent("Accesorios");
  });

  it("muestra la categoría del producto en la tabla, y «Sin categoría» cuando no tiene", async () => {
    vi.mocked(searchProducts).mockResolvedValue({
      items: [
        makeProduct(),
        makeProduct({ id: "p2", name: "Cepillo", category_name: null }),
      ],
      count: 2,
    });
    render(<ProductsPage />);

    expect(await screen.findByText("Higiene")).toBeInTheDocument();
    expect(await screen.findByText("Sin categoría")).toBeInTheDocument();
  });

  it("sin categorías en el negocio no pinta el filtro ni la columna", async () => {
    vi.mocked(listProductCategories).mockResolvedValue([]);
    render(<ProductsPage />);

    await screen.findByText("Shampoo hipoalergénico");
    expect(screen.queryByLabelText("Categoría")).not.toBeInTheDocument();
    expect(screen.queryByText("Higiene")).not.toBeInTheDocument();
  });

  it("si fallan las categorías la tabla sigue en pie: es lo que se vino a ver", async () => {
    vi.mocked(listProductCategories).mockRejectedValue(new Error("500"));
    render(<ProductsPage />);

    expect(await screen.findByText("Shampoo hipoalergénico")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /reintentar/i }),
    ).not.toBeInTheDocument();
  });
});

describe("ProductsPage — stock bajo", () => {
  it("«Agotados (0)» manda stock_lte=0: el cero es el filtro, no la ausencia de filtro", async () => {
    const user = userEvent.setup();
    render(<ProductsPage />);
    await screen.findByText("Shampoo hipoalergénico");

    await user.click(screen.getByLabelText("Stock"));
    await user.click(await screen.findByRole("option", { name: "Agotados (0)" }));

    await waitFor(() =>
      expect(searchProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ stock_lte: "0", offset: 0 }),
      ),
    );
    // Y viaja en la URL, así que «lo que se está acabando» se comparte por chat.
    expect(new URLSearchParams(window.location.search).get("stock_lte")).toBe("0");
  });

  it("sin preset no manda stock_lte", async () => {
    render(<ProductsPage />);

    await waitFor(() => expect(searchProducts).toHaveBeenCalled());
    expect(searchProducts).toHaveBeenCalledWith(
      expect.objectContaining({ stock_lte: undefined }),
    );
  });

  it("el vacío con solo el filtro de stock ofrece limpiar, y limpiar borra los cuatro", async () => {
    const user = userEvent.setup();
    vi.mocked(searchProducts).mockResolvedValue({ items: [], count: 0 });
    searchParamsStub.current = new URLSearchParams("stock_lte=0&category_id=2");
    render(<ProductsPage />);

    expect(await screen.findByText("Sin resultados")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    await waitFor(() =>
      expect(searchProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          stock_lte: undefined,
          category_id: undefined,
          active: undefined,
          search: undefined,
        }),
      ),
    );
    expect(window.location.search).toBe("");
  });
});

describe("ProductsPage — recarga que no encoge la lista (PROD-7)", () => {
  it("tras crear recarga las filas visibles, no la primera página", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 25 }, (_, i) =>
      makeProduct({ id: `p${i}`, name: `Producto ${i}` }),
    );
    vi.mocked(searchProducts).mockResolvedValue({ items: many, count: 40 });

    render(<ProductsPage />);
    await screen.findByText("Producto 0");

    await user.click(screen.getByRole("button", { name: "Nuevo producto" }));
    await user.type(screen.getByLabelText("Nombre"), "Cepillo doble");
    await user.type(screen.getByLabelText("Precio"), "4990");
    await user.click(screen.getByRole("button", { name: "Crear" }));

    await waitFor(() =>
      expect(searchProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 25, offset: 0 }),
      ),
    );
  });
});

describe("ProductsPage — respuestas obsoletas (PROD-8)", () => {
  it("una respuesta vieja no pisa a la del filtro vigente", async () => {
    const user = userEvent.setup();
    let resolveStale: ((value: Paginated<Product>) => void) | undefined;

    vi.mocked(searchProducts).mockImplementation((params = {}) => {
      if (params.search === "cepi") {
        return new Promise<Paginated<Product>>((resolve) => {
          resolveStale = resolve;
        });
      }
      return Promise.resolve({ items: [makeProduct()], count: 1 });
    });

    render(<ProductsPage />);
    await screen.findByText("Shampoo hipoalergénico");

    const input = screen.getByLabelText("Buscar");
    await user.type(input, "cepi");
    await waitFor(() => expect(resolveStale).toBeDefined());

    // El operador se arrepiente antes de que conteste el servidor.
    await user.clear(input);
    await waitFor(() =>
      expect(searchProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: undefined }),
      ),
    );

    resolveStale!({
      items: [makeProduct({ id: "p9", name: "Cepillo doble" })],
      count: 1,
    });

    await waitFor(() =>
      expect(screen.getByText("Shampoo hipoalergénico")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Cepillo doble")).not.toBeInTheDocument();
  });

  // La misma guarda, ahora por los filtros NUEVOS: sin ellos en `isStale`, la
  // respuesta de «Accesorios» aterrizaba sobre la vista «Todas».
  it("una respuesta de otra categoría no pisa a la vista vigente", async () => {
    const user = userEvent.setup();
    let resolveStale: ((value: Paginated<Product>) => void) | undefined;

    vi.mocked(searchProducts).mockImplementation((params = {}) => {
      if (params.category_id === "2") {
        return new Promise<Paginated<Product>>((resolve) => {
          resolveStale = resolve;
        });
      }
      return Promise.resolve({ items: [makeProduct()], count: 1 });
    });

    render(<ProductsPage />);
    await screen.findByText("Shampoo hipoalergénico");

    await user.click(screen.getByLabelText("Categoría"));
    await user.click(await screen.findByRole("option", { name: "Accesorios" }));
    await waitFor(() => expect(resolveStale).toBeDefined());

    await user.click(screen.getByLabelText("Categoría"));
    await user.click(await screen.findByRole("option", { name: "Todas" }));
    await waitFor(() =>
      expect(searchProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ category_id: undefined }),
      ),
    );

    resolveStale!({
      items: [makeProduct({ id: "p9", name: "Collar rojo" })],
      count: 1,
    });

    await waitFor(() =>
      expect(screen.getByText("Shampoo hipoalergénico")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Collar rojo")).not.toBeInTheDocument();
  });
});

/** Frescura del catálogo por SSE (auditoría 2026-08-20): `producto_*` recarga
 * las filas visibles, el eco del propio toggle se consume, y `pedido_cancelado`
 * refresca el stock igual que `pedido_creado` (cancelar un confirmado lo
 * restaura). */
describe("ProductsPage — SSE de catálogo", () => {
  function emitSse(event: SSEEvent) {
    act(() => {
      for (const handler of sseHandlers) handler(event);
    });
  }

  it("un producto_creado remoto recarga las filas visibles sin tocar categorías", async () => {
    render(<ProductsPage />);
    await screen.findByText("Shampoo hipoalergénico");
    expect(vi.mocked(searchProducts)).toHaveBeenCalledTimes(1);

    emitSse({
      id: "pr1",
      type: "producto_creado",
      emitted_at: "2026-08-20T10:00:00Z",
      data: { product_id: "p9", active: true },
    } as SSEEvent);

    await waitFor(() => expect(vi.mocked(searchProducts)).toHaveBeenCalledTimes(2));
    // Las categorías no se recargan: el payload no trae señal de categoría.
    expect(vi.mocked(listProductCategories)).toHaveBeenCalledTimes(1);
  });

  it("el eco del propio toggle se consume; el mismo evento con id ajeno sí recarga", async () => {
    render(<ProductsPage />);
    await screen.findByText("Shampoo hipoalergénico");

    // Toggle propio → arma la clave ANTES del PATCH → el eco no refetchea.
    await userEvent.click(screen.getByRole("switch", { name: "Desactivar producto" }));
    emitSse({
      id: "pr2",
      type: "producto_actualizado",
      emitted_at: "2026-08-20T10:00:01Z",
      data: { product_id: "p1", active: false },
    } as SSEEvent);
    expect(vi.mocked(searchProducts)).toHaveBeenCalledTimes(1);

    // Un cambio de OTRA sesión sobre otro producto sí recarga.
    emitSse({
      id: "pr3",
      type: "producto_actualizado",
      emitted_at: "2026-08-20T10:00:02Z",
      data: { product_id: "p999", active: true },
    } as SSEEvent);
    await waitFor(() => expect(vi.mocked(searchProducts)).toHaveBeenCalledTimes(2));
  });

  it("pedido_cancelado recarga el stock igual que pedido_creado", async () => {
    render(<ProductsPage />);
    await screen.findByText("Shampoo hipoalergénico");

    emitSse({
      id: "pc1",
      type: "pedido_cancelado",
      emitted_at: "2026-08-20T10:00:00Z",
      data: { order_id: "31", total: "17000", customer_id: "9" },
    } as SSEEvent);

    await waitFor(() => expect(vi.mocked(searchProducts)).toHaveBeenCalledTimes(2));
  });
});
