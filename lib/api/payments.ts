import { api } from "./client";

/** `sent` belongs to a LINK, not a payment: nobody has paid it yet.
 *  `rejected` is the gateway's FINAL no — before it existed, a refused payment
 *  kept reading "pendiente" and the panel showed an operator a charge still in
 *  flight that had died hours earlier. */
export type PaymentStatus = "pending" | "paid" | "expired" | "sent" | "rejected";

/** What a row actually is. A minted link has no `Payment` row until the
 *  customer opens it, so the list interleaves both or it cannot answer "what
 *  did I send and who has not paid?". */
type PaymentKind = "payment" | "link";

/** A row of the payments table (mirrors `PaymentRowOut`). */
export interface Payment {
  kind: PaymentKind;
  id: string;
  /** `trans_id` for a payment, the link's public uuid for a link. Never the
   *  link's secret — that is not stored anywhere. */
  reference: string;
  status: PaymentStatus;
  /** Backend Decimal string → number, like every other money field in the panel. */
  amount: number;
  currency: string;
  created_at: string;
  paid_at: string | null;
  expires_at: string;
  customer_id: string | null;
  /** Display name, or the phone when there is none. Empty for link payments with no customer. */
  customer_name: string;
  /** What the link is for. Empty on a payment, which its method describes. */
  concept: string;
  /** Empty on a link: no gateway is chosen until the customer picks one. */
  method_label: string;
  /** The gateway that processed it ("ALPS JustPay") — not the brand. */
  provider_name: string;
  /** The brand the customer actually paid with ("Khipu"). With a second gateway
   *  in the catalog the same brand can arrive through either one, so the two are
   *  separate answers and the table shows both. */
  channel_name: string;
}

/**
 * A page of payments.
 *
 * **There is no `count`, and that is the contract.** The backend is keyset
 * paginated: it never runs `COUNT(*)` over a filtered slice of a tenant's
 * history, so "página 3 de 812" is not a number this API can produce cheaply
 * and the UI must not be built expecting one. `has_more` is what it answers,
 * and it costs one extra row.
 */
interface PaymentPage {
  items: Payment[];
  /** Opaque. Pass it back verbatim; never parse or construct one. */
  next_cursor: string;
  has_more: boolean;
}

interface BackendPayment {
  kind: PaymentKind;
  id: number;
  reference: string;
  status: PaymentStatus;
  amount: string;
  currency: string;
  created_at: string;
  paid_at: string | null;
  expires_at: string;
  customer_id: number | null;
  customer_name: string;
  concept: string;
  method_label: string;
  provider_name: string;
  channel_name: string;
}

function fromBackend(p: BackendPayment): Payment {
  return {
    ...p,
    id: String(p.id),
    customer_id: p.customer_id === null ? null : String(p.customer_id),
    amount: Number(p.amount),
  };
}

/** Everything the detail endpoint (`GET /payments/{id}/`) knows about one payment. */
export interface PaymentDetail {
  id: string;
  trans_id: string;
  status: PaymentStatus;
  /** Backend Decimal string → number, like every other money field in the panel. */
  amount: number;
  currency: string;
  checkout_url: string;
  expires_at: string;
  paid_at: string | null;
  shopper_email: string;
  shopper_doc_number: string;
  shopper_name: string;
  /** Whatever the gateway reported, verbatim — shown as-is, never interpreted. */
  provider_metadata: Record<string, unknown>;
  payment_method: { id: string; channel_id: string; label: string } | null;
}

interface BackendPaymentDetail {
  id: number;
  trans_id: string;
  status: PaymentStatus;
  amount: string;
  currency: string;
  checkout_url: string;
  expires_at: string;
  paid_at: string | null;
  shopper_email: string;
  shopper_doc_number: string;
  shopper_name: string;
  provider_metadata: Record<string, unknown>;
  payment_method: { id: number; channel_id: number; label: string } | null;
}

/** Fetches a single payment with the shopper data the list deliberately omits. */
export async function getPayment(id: string): Promise<PaymentDetail> {
  const res = await api.get<BackendPaymentDetail>(`/payments/${id}/`);
  return {
    ...res,
    id: String(res.id),
    amount: Number(res.amount),
    payment_method: res.payment_method
      ? {
          ...res.payment_method,
          id: String(res.payment_method.id),
          channel_id: String(res.payment_method.channel_id),
        }
      : null,
  };
}

export interface PaymentFilters {
  status?: PaymentStatus | "";
  currency?: string;
  payment_method_id?: string;
  customer_id?: string;
  /** Every row — payment or unpaid link — tied to one appointment. */
  appointment_id?: string;
  /** ISO 8601. The window is half-open: `[from, to)`. */
  created_from?: string;
  created_to?: string;
  /** A `trans_id` PREFIX, case-sensitive — that is what the index can serve. */
  search?: string;
}

export async function listPayments(
  filters: PaymentFilters = {},
  opts: { cursor?: string; limit?: number } = {},
): Promise<PaymentPage> {
  const res = await api.get<{
    items: BackendPayment[];
    next_cursor: string;
    has_more: boolean;
  }>("/payments/", {
    // Los filtros van tal cual: `buildUrl` descarta la cadena vacía igual que
    // `undefined`, así que un filtro sin poner ya no llega como `?status=`.
    query: {
      ...filters,
      ...(opts.cursor ? { cursor: opts.cursor } : {}),
      limit: String(opts.limit ?? 25),
    },
  });
  return {
    items: res.items.map(fromBackend),
    next_cursor: res.next_cursor,
    has_more: res.has_more,
  };
}

export interface PaymentSummaryRow {
  currency: string;
  paid_amount: number;
  paid_count: number;
  total_count: number;
}

/**
 * Totals for a bounded window, grouped by currency.
 *
 * The window is REQUIRED — an unbounded `SUM` is a full scan of the tenant's
 * history — and it is the ONLY input: these are paid totals by definition, so
 * honouring the table's status filter rendered the card as `$0` while the
 * operator looked at pending rows.
 */
export async function paymentsSummary(window: {
  created_from: string;
  created_to: string;
}): Promise<PaymentSummaryRow[]> {
  const rows = await api.get<
    { currency: string; paid_amount: string; paid_count: number; total_count: number }[]
  >("/payments/summary/", { query: { ...window } });
  return rows.map((r) => ({ ...r, paid_amount: Number(r.paid_amount) }));
}

export interface PaymentLink {
  public_id: string;
  /** Carries the one-time secret. Not recoverable from anywhere afterwards. */
  url: string;
  concept: string;
  amount: number;
  currency: string;
  expires_at: string;
  customer_id: string | null;
}

interface CreatePaymentLinkInput {
  concept: string;
  amount: number;
  customer_id?: string;
  /** A cita OR a pedido, never both — the backend answers 400 for the pair.
   *  Whichever is set rides onto the resulting Payment row, which is what makes
   *  "what did this money settle?" answerable from the payment afterwards. */
  appointment_id?: string;
  order_id?: string;
  currency?: string;
  ttl_hours?: number;
}

/**
 * Mints a shareable payment link.
 *
 * The response is the ONLY place the link's secret ever appears — the backend
 * stores just its sha256. Callers must show the URL and let the operator copy
 * it before the dialog closes; there is no "show me that link again".
 */
export async function createPaymentLink(
  input: CreatePaymentLinkInput,
): Promise<PaymentLink> {
  const res = await api.post<{
    public_id: string;
    url: string;
    concept: string;
    amount: string;
    currency: string;
    expires_at: string;
    customer_id: number | null;
  }>("/payments/links/", {
    concept: input.concept,
    amount: String(input.amount),
    currency: input.currency,
    customer_id: input.customer_id ? Number(input.customer_id) : undefined,
    appointment_id: input.appointment_id ? Number(input.appointment_id) : undefined,
    order_id: input.order_id ? Number(input.order_id) : undefined,
    ttl_hours: input.ttl_hours,
  });
  return {
    ...res,
    amount: Number(res.amount),
    customer_id: res.customer_id === null ? null : String(res.customer_id),
  };
}

/**
 * Rotates an existing link's secret and hands back a working URL.
 *
 * Not "get me that link again" — that is impossible, only the sha256 is stored.
 * Same row, same `public_id`, same cita/pedido and same frozen amount, but **a
 * URL sent earlier stops working the moment this resolves.** Treat the response
 * exactly like a mint: it is the one and only time the new secret exists.
 *
 * 400 is the normal, expected answer for a link that was already paid, revoked,
 * expired, or has a checkout in flight right now. Show `e.message`.
 */
export async function reissuePaymentLink(publicId: string): Promise<PaymentLink> {
  const res = await api.post<{
    public_id: string;
    url: string;
    concept: string;
    amount: string;
    currency: string;
    expires_at: string;
    customer_id: number | null;
  }>(`/payments/links/${publicId}/reissue/`);
  return {
    ...res,
    amount: Number(res.amount),
    customer_id: res.customer_id === null ? null : String(res.customer_id),
  };
}

/**
 * What a verification concluded. Three outcomes, and they are NOT the same:
 *
 * - `verdict: true`  — the gateway confirmed it. The row is now `paid`.
 * - `verdict: false` — a FINAL no. The row is now `rejected`.
 * - `verdict: null`  — we could not get an answer (gateway down, or not
 *   configured). **Nothing was written**, and reporting this as "no pagó" tells
 *   an operator a live charge is dead.
 *
 * `checked: false` means no call was made because the row was already final;
 * `status` still reflects the truth, so patch the row with it either way.
 */
export interface PaymentVerification {
  status: PaymentStatus;
  verdict: boolean | null;
  checked: boolean;
  /** `origen:razón[:id]`, e.g. `panel:paid:3`. For support, not for branching. */
  verification: string;
}

/** Asks the gateway what really happened with a payment, and writes the answer. */
export async function verifyPayment(id: string): Promise<PaymentVerification> {
  return api.post<PaymentVerification>(`/payments/${id}/verify/`);
}

export interface PaymentMethodOption {
  id: string;
  label: string;
}

/** Active methods, for the filter dropdown. */
export async function listActivePaymentMethods(): Promise<PaymentMethodOption[]> {
  const rows = await api.get<{ id: number; label: string }[]>(
    "/payments/payment-methods/",
    {
      query: { active: "true" },
    },
  );
  return rows.map((r) => ({ id: String(r.id), label: r.label }));
}
