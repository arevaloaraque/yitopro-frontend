/**
 * Payments page — the contract that has to hold at a million rows.
 *
 * The list is keyset-paginated and the backend never returns a `count`, so the
 * things worth pinning here are the ones a "load more" button usually gets
 * wrong: paging by opaque cursor rather than offset, carrying the active
 * filters into page two, and not promising a total the API cannot produce.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SSEEvent } from "@/lib/types";
import {
  getPayment,
  listActivePaymentMethods,
  listPayments,
  paymentsSummary,
  reissuePaymentLink,
  verifyPayment,
  type Payment,
  type PaymentDetail,
  type PaymentVerification,
} from "@/lib/api/payments";

import PaymentsPage from "../page";

vi.mock("@/lib/api/payments");
vi.mock("@/lib/api/customers");

// The verdict branch is only observable in WHICH toast fires: the row badge
// is patched unconditionally from the response, so asserting on it cannot
// tell "rechazado" apart from "no pudimos confirmar".
const { toast } = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("sonner", () => ({ toast }));

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

function makePayment(over: Partial<Payment> = {}): Payment {
  return {
    kind: "payment",
    id: "1",
    reference: "YTO-1-aaaaaaaaaaaa",
    status: "paid",
    amount: 15000,
    currency: "CLP",
    created_at: new Date().toISOString(),
    paid_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    customer_id: "7",
    customer_name: "Ana Fuentes",
    concept: "",
    method_label: "Tarjeta de crédito o débito",
    provider_name: "ALPS JustPay",
    channel_name: "Transbank",
    ...over,
  };
}

function makeDetail(over: Partial<PaymentDetail> = {}): PaymentDetail {
  return {
    id: "1",
    trans_id: "YTO-1-aaaaaaaaaaaa",
    status: "paid",
    amount: 15000,
    currency: "CLP",
    checkout_url: "https://pay.test/checkout/1",
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    paid_at: new Date().toISOString(),
    shopper_email: "ana@example.com",
    shopper_doc_number: "12.345.678-9",
    shopper_name: "Ana María Fuentes",
    provider_metadata: { authorization_code: "A1B2C3" },
    payment_method: { id: "3", channel_id: "tbk", label: "Tarjeta de crédito o débito" },
    ...over,
  };
}

function emit(event: Partial<SSEEvent> & { type: SSEEvent["type"] }) {
  for (const handler of sseHandlers) {
    handler({
      id: "e1",
      emitted_at: new Date().toISOString(),
      ...event,
    } as SSEEvent);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  sseHandlers.length = 0;
  searchParamsStub.current = new URLSearchParams();
  vi.mocked(listActivePaymentMethods).mockResolvedValue([
    { id: "3", label: "Tarjeta de crédito o débito" },
  ]);
  vi.mocked(paymentsSummary).mockResolvedValue([
    { currency: "CLP", paid_amount: 15000, paid_count: 1, total_count: 2 },
  ]);
  vi.mocked(listPayments).mockResolvedValue({
    items: [makePayment()],
    next_cursor: "",
    has_more: false,
  });
  vi.mocked(getPayment).mockResolvedValue(makeDetail());
});

describe("PaymentsPage", () => {
  it("renders a payment with its own currency, not the tenant's", async () => {
    vi.mocked(listPayments).mockResolvedValue({
      items: [makePayment({ amount: 9.5, currency: "USD" })],
      next_cursor: "",
      has_more: false,
    });
    render(<PaymentsPage />);
    // A per-row currency: the tenant-bound formatter would print this as pesos.
    expect(await screen.findByText(/US\$9,50/)).toBeInTheDocument();
  });

  it("never claims a list total it cannot know", async () => {
    // The list endpoint runs no COUNT(*), so "1 de 4.312" is a number the UI
    // must not invent. The footer says how many it is showing and whether more
    // exist — nothing else.
    //
    // (The summary card above it DOES show "1 de 2", and legitimately: that
    // count comes from the windowed summary endpoint, which is bounded and
    // rides the same index. Hence the assertion is scoped to the footer.)
    vi.mocked(listPayments).mockResolvedValue({
      items: [makePayment()],
      next_cursor: "cur-1",
      has_more: true,
    });
    render(<PaymentsPage />);
    const footer = await screen.findByText(/1 registro \(hay más\)/);
    expect(footer.textContent).toBe("1 registro (hay más)");
  });

  it("pages with the opaque cursor and keeps the filters", async () => {
    const user = userEvent.setup();
    vi.mocked(listPayments).mockResolvedValueOnce({
      items: [makePayment({ id: "1" })],
      next_cursor: "opaque-cursor",
      has_more: true,
    });
    render(<PaymentsPage />);

    const more = await screen.findByRole("button", { name: /cargar más/i });
    vi.mocked(listPayments).mockResolvedValueOnce({
      items: [makePayment({ id: "2", customer_name: "Beto" })],
      next_cursor: "",
      has_more: false,
    });
    await user.click(more);

    await waitFor(() => expect(screen.getByText("Beto")).toBeInTheDocument());
    const [filters, opts] = vi.mocked(listPayments).mock.calls[1];
    expect(opts?.cursor).toBe("opaque-cursor");
    // Dropping the filters on page two is the classic keyset bug: the operator
    // silently gets rows that do not match what the screen says.
    expect(filters).toMatchObject({ created_from: expect.any(String) });
    expect(screen.getByText("Ana Fuentes")).toBeInTheDocument();
  });

  it("asks for the summary over the same bounded window as the table", async () => {
    render(<PaymentsPage />);
    await waitFor(() => expect(paymentsSummary).toHaveBeenCalled());
    const [window] = vi.mocked(paymentsSummary).mock.calls[0];
    const span =
      new Date(window.created_to).getTime() - new Date(window.created_from).getTime();
    // The endpoint refuses an unbounded SUM; the default preset must be inside
    // the cap, not something the user discovers via a 400.
    expect(span).toBeGreaterThan(0);
    expect(span).toBeLessThanOrEqual(366 * 86_400_000);
  });

  it("seeds its filters from the URL", async () => {
    searchParamsStub.current = new URLSearchParams("status=pending&q=YTO-1-a");
    render(<PaymentsPage />);
    await waitFor(() => expect(listPayments).toHaveBeenCalled());
    expect(vi.mocked(listPayments).mock.calls[0][0]).toMatchObject({
      status: "pending",
      search: "YTO-1-a",
    });
  });

  it("patches the row and refreshes only the summary when a loaded payment settles", async () => {
    // The row is on screen, so a full refetch would only risk dropping it
    // under an active filter: patch it, refresh the totals, leave the list.
    vi.mocked(listPayments).mockResolvedValue({
      items: [makePayment({ status: "pending", paid_at: null })],
      next_cursor: "",
      has_more: false,
    });
    render(<PaymentsPage />);
    await waitFor(() => expect(listPayments).toHaveBeenCalledTimes(1));
    const summaryCalls = vi.mocked(paymentsSummary).mock.calls.length;

    emit({
      type: "pago_recibido",
      data: { payment_id: "1", amount: "15000", currency: "CLP", customer_id: "7" },
    });

    await waitFor(() => expect(screen.getByText("Pagado")).toBeInTheDocument());
    expect(listPayments).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(vi.mocked(paymentsSummary).mock.calls.length).toBe(summaryCalls + 1),
    );
  });

  it("refetches the list when the settled payment is NOT on screen", async () => {
    // A payment_id we have no row for can be one we have never seen — the
    // refetch is what makes it appear.
    render(<PaymentsPage />);
    await waitFor(() => expect(listPayments).toHaveBeenCalledTimes(1));
    emit({
      type: "pago_recibido",
      data: { payment_id: "99", amount: "15000", currency: "CLP", customer_id: "7" },
    });
    await waitFor(() => expect(listPayments).toHaveBeenCalledTimes(2));
  });

  it("marks a loaded row Rechazado on pago_rechazado, without a list refetch", async () => {
    vi.mocked(listPayments).mockResolvedValue({
      items: [makePayment({ status: "pending", paid_at: null })],
      next_cursor: "",
      has_more: false,
    });
    render(<PaymentsPage />);
    await waitFor(() => expect(listPayments).toHaveBeenCalledTimes(1));
    const summaryCalls = vi.mocked(paymentsSummary).mock.calls.length;

    emit({
      type: "pago_rechazado",
      data: { payment_id: "1", amount: "15000", currency: "CLP", customer_id: "7" },
    });

    await waitFor(() => expect(screen.getByText("Rechazado")).toBeInTheDocument());
    expect(listPayments).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(vi.mocked(paymentsSummary).mock.calls.length).toBe(summaryCalls + 1),
    );
  });

  it("accepts a custom window and keeps it inside the cap", async () => {
    // A preset is trailing and known; an arbitrary range is the one an operator
    // can make enormous by accident, so the UI caps it at 31 days.
    searchParamsStub.current = new URLSearchParams(
      "range=custom&from=2026-07-01&to=2026-07-20",
    );
    render(<PaymentsPage />);
    await waitFor(() => expect(listPayments).toHaveBeenCalled());
    const filters = vi.mocked(listPayments).mock.calls[0][0]!;
    expect(filters.created_from!.slice(0, 10)).toBe("2026-07-01");
    // Half-open: "hasta el 20" has to include the 20th, so the bound is the 21st.
    expect(filters.created_to!.slice(0, 10)).toBe("2026-07-21");
  });

  it("refuses a custom window longer than the cap without firing a request", async () => {
    const user = userEvent.setup();
    searchParamsStub.current = new URLSearchParams(
      "range=custom&from=2026-01-01&to=2026-07-20",
    );
    render(<PaymentsPage />);
    await waitFor(() => expect(listPayments).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toHaveTextContent(/31 días/);
    // Falls back to the default window rather than sending the huge one.
    const filters = vi.mocked(listPayments).mock.calls[0][0]!;
    const span = Date.parse(filters.created_to!) - Date.parse(filters.created_from!);
    expect(span).toBeLessThanOrEqual(31 * 86_400_000);
    await user.click(screen.getByLabelText(/desde \/ hasta/i).closest("div")!);
  });

  it("shows the gateway and the brand as separate answers", async () => {
    render(<PaymentsPage />);
    // Rendered in the xl-only column, which jsdom lays out regardless of width.
    expect(await screen.findByText("Transbank")).toBeInTheDocument();
    expect(screen.getByText("ALPS JustPay")).toBeInTheDocument();
  });

  it("shows an unpaid link as a row of its own", async () => {
    // A minted link has no Payment row until the customer opens it. Without it
    // in the list the operator cannot see what they sent — which is exactly
    // what they asked after generating one.
    vi.mocked(listPayments).mockResolvedValue({
      items: [
        makePayment({
          kind: "link",
          id: "9",
          reference: "89c7fcbe-b019-4db5-9ed7-9d815c21c682",
          status: "sent",
          concept: "Control de vacunas",
          method_label: "",
          provider_name: "",
          channel_name: "",
        }),
      ],
      next_cursor: "",
      has_more: false,
    });
    render(<PaymentsPage />);
    expect(await screen.findByText("Enviado")).toBeInTheDocument();
    // The concept is what a link is described by; it has no method yet.
    expect(screen.getByText("Control de vacunas")).toBeInTheDocument();
    expect(screen.getByText("Sin elegir")).toBeInTheDocument();
    // The uuid tail, never the secret.
    expect(screen.getByText(/…5c21c682/)).toBeInTheDocument();
  });

  it("tells an empty list apart from an empty filter result", async () => {
    vi.mocked(listPayments).mockResolvedValue({
      items: [],
      next_cursor: "",
      has_more: false,
    });
    searchParamsStub.current = new URLSearchParams("status=paid");
    render(<PaymentsPage />);
    // With a filter on, "todavía no hay pagos" would send the operator looking
    // for a bug in the product instead of at the filter they set.
    expect(await screen.findByText(/sin resultados/i)).toBeInTheDocument();
  });
});

/**
 * The actions column. Two icons, and the two ways they go badly wrong.
 *
 * Rows come from two different tables and their ids collide — payment 5 and
 * link 5 both exist, which is why the backend cursor carries `kind` at all.
 */
function makeLink(over: Partial<Payment> = {}): Payment {
  return makePayment({
    kind: "link",
    id: "1",
    reference: "6f1c9a2e-0000-4000-8000-000000000001",
    status: "sent",
    paid_at: null,
    concept: "Corte de pelo",
    method_label: "",
    provider_name: "",
    channel_name: "",
    ...over,
  });
}

describe("PaymentsPage row actions", () => {
  it("never sends a link row to the payment verification endpoint", async () => {
    // A link's status is `sent`, which passes any "not a final status" test —
    // and its id addresses a DIFFERENT table. Verifying it would ask the
    // gateway about an unrelated charge and could write that one `rejected`.
    vi.mocked(listPayments).mockResolvedValue({
      items: [makeLink()],
      next_cursor: "",
      has_more: false,
    });
    vi.mocked(reissuePaymentLink).mockResolvedValue({
      public_id: "6f1c9a2e-0000-4000-8000-000000000001",
      url: "https://app.test/pagar/6f1c9a2e-0000-4000-8000-000000000001/?t=nuevo",
      concept: "Corte de pelo",
      amount: 15000,
      currency: "CLP",
      expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      customer_id: "7",
    });
    const user = userEvent.setup();
    render(<PaymentsPage />);

    const action = await screen.findByRole("button", {
      name: /Generar un enlace nuevo/,
    });
    // Asserted BEFORE the click, and that ordering is the test: clicking opens
    // a modal, which takes the whole table out of the accessibility tree — so
    // the same query afterwards passes no matter what the row rendered.
    expect(
      screen.queryByRole("button", { name: /Verificar con la pasarela/ }),
    ).toBeNull();

    await user.click(action);

    await waitFor(() =>
      expect(reissuePaymentLink).toHaveBeenCalledWith(
        "6f1c9a2e-0000-4000-8000-000000000001",
      ),
    );
    expect(verifyPayment).not.toHaveBeenCalled();
    // And the one-time URL reaches a surface the operator can copy. Without
    // this the POST would still succeed — rotating the secret and killing the
    // URL the customer holds — while the replacement lived only in a discarded
    // JS object. The server stores sha256 only; it cannot be asked again.
    expect(await screen.findByDisplayValue(/\?t=nuevo$/)).toBeInTheDocument();
  });

  it("keeps a just-confirmed row on screen under the Pendientes filter", async () => {
    // The filter used to FIND rows worth verifying is the one a confirmation
    // stops matching. Refetching here would make the row vanish one beat after
    // the success toast; the row is patched from the response instead.
    searchParamsStub.current = new URLSearchParams("status=pending");
    vi.mocked(listPayments).mockResolvedValue({
      items: [makePayment({ status: "pending", paid_at: null })],
      next_cursor: "",
      has_more: false,
    });
    vi.mocked(verifyPayment).mockResolvedValue({
      status: "paid",
      verdict: true,
      checked: true,
      verification: "panel:paid:3",
    });
    const user = userEvent.setup();
    render(<PaymentsPage />);

    const action = await screen.findByRole("button", {
      name: /Verificar con la pasarela/,
    });
    const listCallsBefore = vi.mocked(listPayments).mock.calls.length;
    await user.click(action);

    await waitFor(() => expect(screen.getByText("Pagado")).toBeInTheDocument());
    expect(screen.getByText("Ana Fuentes")).toBeInTheDocument();
    // The payment's OWN id. `reference` is the trans_id, and the endpoint is
    // typed `payment_id: int` — sending it would 422 on every click.
    expect(verifyPayment).toHaveBeenCalledWith("1");
    // Patched, not reloaded: a reload would drop it and discard paged-in rows.
    expect(vi.mocked(listPayments).mock.calls.length).toBe(listCallsBefore);
    // The card is a separate SUM over paid rows, so it alone is refreshed.
    await waitFor(() => expect(paymentsSummary).toHaveBeenCalledTimes(2));

    // The echo of OUR OWN write must not refetch — the backend publishes
    // post-commit but pre-return, so this frame can even beat the 200.
    const summaryCalls = vi.mocked(paymentsSummary).mock.calls.length;
    emit({
      type: "pago_recibido",
      data: { payment_id: "1", amount: "15000", currency: "CLP", customer_id: "7" },
    });
    expect(vi.mocked(listPayments).mock.calls.length).toBe(listCallsBefore);
    expect(vi.mocked(paymentsSummary).mock.calls.length).toBe(summaryCalls);

    // Consume-once: a LATER change to the same payment, by anyone else, still
    // has to refresh the screen. The row is on screen, so the refresh is the
    // summary — not the list, which would drop the row under this filter.
    emit({
      type: "pago_recibido",
      data: { payment_id: "1", amount: "15000", currency: "CLP", customer_id: "7" },
    });
    await waitFor(() =>
      expect(vi.mocked(paymentsSummary).mock.calls.length).toBe(summaryCalls + 1),
    );
    expect(vi.mocked(listPayments).mock.calls.length).toBe(listCallsBefore);
  });

  it("does not report an unreachable gateway as a refusal", async () => {
    // `verdict: null` means nothing was written. Calling it "rechazado" tells
    // an operator a live charge is dead.
    vi.mocked(listPayments).mockResolvedValue({
      items: [makePayment({ status: "pending", paid_at: null })],
      next_cursor: "",
      has_more: false,
    });
    vi.mocked(verifyPayment).mockResolvedValue({
      status: "pending",
      verdict: null,
      checked: true,
      verification: "panel:unreachable",
    });
    const user = userEvent.setup();
    render(<PaymentsPage />);

    await user.click(
      await screen.findByRole("button", { name: /Verificar con la pasarela/ }),
    );

    await waitFor(() => expect(verifyPayment).toHaveBeenCalled());
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    // The badge alone cannot tell this apart from a refusal — it is patched
    // from the response either way. Which toast fired is the whole difference.
    expect(toast.warning).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("says rechazado, and only then, on a final no", async () => {
    vi.mocked(listPayments).mockResolvedValue({
      items: [makePayment({ status: "pending", paid_at: null })],
      next_cursor: "",
      has_more: false,
    });
    vi.mocked(verifyPayment).mockResolvedValue({
      status: "rejected",
      verdict: false,
      checked: true,
      verification: "panel:unpaid:4",
    });
    const user = userEvent.setup();
    render(<PaymentsPage />);

    await user.click(
      await screen.findByRole("button", { name: /Verificar con la pasarela/ }),
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.warning).not.toHaveBeenCalled();
    expect(screen.getByText("Rechazado")).toBeInTheDocument();
  });

  it("offers no action on a row that is already final", async () => {
    // The default fixture is `paid`. A verify button here would spend a
    // gateway round trip to be told what the row already says.
    render(<PaymentsPage />);
    await screen.findByText("Ana Fuentes");
    expect(
      screen.queryByRole("button", { name: /Verificar con la pasarela/ }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Generar un enlace nuevo/ }),
    ).toBeNull();
  });

  it("offers no reissue on an expired link", async () => {
    // The backend refuses it with a 400 — re-arming an expired link would undo
    // the platform's only kill switch for a minted credential. A button that
    // can only fail is a button that should not be there.
    vi.mocked(listPayments).mockResolvedValue({
      items: [makeLink({ status: "expired" })],
      next_cursor: "",
      has_more: false,
    });
    render(<PaymentsPage />);
    await screen.findByText("Corte de pelo");
    expect(
      screen.queryByRole("button", { name: /Generar un enlace nuevo/ }),
    ).toBeNull();
  });

  it("refreshes when a payment is REFUSED elsewhere, not just when one is paid", async () => {
    // The reason `pago_rechazado` was added at all: a second operator's panel
    // showed a dead charge as "Pendiente" until a reload.
    render(<PaymentsPage />);
    await waitFor(() => expect(listPayments).toHaveBeenCalledTimes(1));
    for (const handler of sseHandlers) {
      handler({
        id: "e1",
        type: "pago_rechazado",
        emitted_at: new Date().toISOString(),
        data: { payment_id: "9", amount: "15000", currency: "CLP", customer_id: "7" },
      } as SSEEvent);
    }
    await waitFor(() => expect(listPayments).toHaveBeenCalledTimes(2));
  });

  it("addresses the right row when a payment and a link share an id", async () => {
    // Payment 5 and link 5 both exist — the backend cursor carries `kind` for
    // exactly this reason. A patch predicate on the id alone rewrites both.
    vi.mocked(listPayments).mockResolvedValue({
      items: [
        makePayment({ id: "5", status: "pending", paid_at: null }),
        makeLink({ id: "5" }),
      ],
      next_cursor: "",
      has_more: false,
    });
    // Held open, because which button SPINS is the only thing `rowKey` decides:
    // with a colliding id, keying the pending state on `p.id` alone spins the
    // link row too and tells the operator it is doing something it is not.
    let settle: (v: PaymentVerification) => void = () => {};
    vi.mocked(verifyPayment).mockReturnValue(
      new Promise<PaymentVerification>((resolve) => {
        settle = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<PaymentsPage />);

    await user.click(
      await screen.findByRole("button", { name: /Verificar con la pasarela/ }),
    );

    await waitFor(() =>
      expect(document.querySelectorAll(".animate-spin")).toHaveLength(1),
    );

    settle({
      status: "paid",
      verdict: true,
      checked: true,
      verification: "panel:paid:3",
    });

    await waitFor(() => expect(screen.getByText("Pagado")).toBeInTheDocument());
    // The link row is a different row in a different table and did not change.
    expect(screen.getByText("Enviado")).toBeInTheDocument();
  });
});

/**
 * The detail dialog. A FINAL payment has no row action left, so the row itself
 * becomes the action; anything still in flight stays a plain row.
 */
describe("PaymentsPage payment detail dialog", () => {
  it("opens from a paid row and fetches that payment's detail", async () => {
    const user = userEvent.setup();
    render(<PaymentsPage />);

    await user.click(
      await screen.findByRole("button", {
        name: /Ver detalle del pago de Ana Fuentes/,
      }),
    );

    await waitFor(() => expect(getPayment).toHaveBeenCalledWith("1"));
    expect(await screen.findByText("Datos del pagador")).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
  });

  it("opens from a rejected row too", async () => {
    vi.mocked(listPayments).mockResolvedValue({
      items: [makePayment({ status: "rejected" })],
      next_cursor: "",
      has_more: false,
    });
    const user = userEvent.setup();
    render(<PaymentsPage />);

    await user.click(
      await screen.findByRole("button", { name: /Ver detalle del pago/ }),
    );
    await waitFor(() => expect(getPayment).toHaveBeenCalledWith("1"));
  });

  it("keeps rows that are not final plain — nothing to open", async () => {
    // A pending payment is operated with the verify button; a link with the
    // reissue one. Neither row is a detail dialog trigger.
    vi.mocked(listPayments).mockResolvedValue({
      items: [
        makePayment({ id: "1", status: "pending", paid_at: null }),
        makePayment({
          kind: "link",
          id: "2",
          reference: "89c7fcbe-b019-4db5-9ed7-9d815c21c682",
          status: "sent",
          paid_at: null,
          customer_name: "Beto",
          concept: "Corte de pelo",
          method_label: "",
          provider_name: "",
          channel_name: "",
        }),
      ],
      next_cursor: "",
      has_more: false,
    });
    render(<PaymentsPage />);
    await screen.findByText("Ana Fuentes");

    expect(
      screen.queryByRole("button", { name: /Ver detalle del pago/ }),
    ).toBeNull();
    expect(getPayment).not.toHaveBeenCalled();
  });
});
