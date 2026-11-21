/**
 * The payment detail dialog.
 *
 * What is worth pinning: the row's own data renders without waiting on the
 * fetch, the shopper block shows who paid (name, RUT, email), the gateway
 * metadata is shown as a key-value list verbatim (never interpreted), and a
 * failed fetch is recoverable from the dialog itself.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPayment, type Payment, type PaymentDetail } from "@/lib/api/payments";

import { PaymentDetailDialog } from "../payment-detail-dialog";

vi.mock("@/lib/api/payments");

function makeRow(over: Partial<Payment> = {}): Payment {
  return {
    kind: "payment",
    id: "1",
    reference: "YTO-1-aaaaaaaaaaaa",
    status: "paid",
    amount: 15000,
    currency: "CLP",
    created_at: "2026-07-30T15:04:00Z",
    paid_at: "2026-07-30T15:04:00Z",
    expires_at: "2026-08-02T15:04:00Z",
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
    expires_at: "2026-08-02T15:04:00Z",
    paid_at: "2026-07-30T15:04:00Z",
    shopper_email: "ana@example.com",
    shopper_doc_number: "12.345.678-9",
    shopper_name: "Ana María Fuentes",
    provider_metadata: { authorization_code: "A1B2C3", installments: 3 },
    payment_method: {
      id: "3",
      channel_id: "tbk",
      label: "Tarjeta de crédito o débito",
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPayment).mockResolvedValue(makeDetail());
});

describe("PaymentDetailDialog", () => {
  it("shows the row's data, who paid, and the gateway metadata verbatim", async () => {
    render(<PaymentDetailDialog row={makeRow()} open onOpenChange={() => {}} />);

    // From the row, no fetch needed.
    expect(screen.getByText("Ana Fuentes")).toBeInTheDocument();

    // From the detail endpoint: shopper identity and metadata, verbatim.
    expect(await screen.findByText("Ana María Fuentes")).toBeInTheDocument();
    expect(screen.getByText("12.345.678-9")).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(screen.getByText("authorization_code")).toBeInTheDocument();
    expect(screen.getByText("A1B2C3")).toBeInTheDocument();
    expect(screen.getByText("installments")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(getPayment).toHaveBeenCalledWith("1");
  });

  it("shows skeletons while the detail is in flight", async () => {
    vi.mocked(getPayment).mockReturnValue(new Promise<PaymentDetail>(() => {}));
    render(<PaymentDetailDialog row={makeRow()} open onOpenChange={() => {}} />);
    // The fetch is deferred a tick (same pattern as the page loader), so the
    // skeletons are too.
    await waitFor(() =>
      expect(
        document.querySelectorAll("[data-slot='skeleton']").length,
      ).toBeGreaterThan(0),
    );
    // The shopper section is the fetched one; it must not render early.
    expect(screen.queryByText("Datos del pagador")).toBeNull();
  });

  it("reports a failed fetch and retries from the dialog", async () => {
    vi.mocked(getPayment).mockRejectedValueOnce(new Error("Error de red"));
    const user = userEvent.setup();
    render(<PaymentDetailDialog row={makeRow()} open onOpenChange={() => {}} />);

    expect(await screen.findByText("Error de red")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(await screen.findByText("ana@example.com")).toBeInTheDocument();
    expect(getPayment).toHaveBeenCalledTimes(2);
  });

  it("fetches nothing while closed", () => {
    render(
      <PaymentDetailDialog row={makeRow()} open={false} onOpenChange={() => {}} />,
    );
    expect(getPayment).not.toHaveBeenCalled();
  });
});
