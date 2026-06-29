import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/mocks/server";

import { StepConfirmar } from "../_components/step-confirmar";
import {
  BASE,
  mockAuthenticatedSession,
  mockRehydration,
  renderStep,
} from "./test-utils";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthenticatedSession();
  mockRehydration();
});

describe("StepConfirmar", () => {
  it("calls complete() and navigates to /dashboard when the backend returns ok", async () => {
    server.use(
      http.post(`${BASE}/businesses/me/onboarding/complete/`, () =>
        HttpResponse.json({ ok: true }),
      ),
    );

    renderStep(<StepConfirmar />);

    await userEvent.click(
      await screen.findByRole("button", { name: /activar negocio/i }),
    );

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/dashboard"),
    );
  });

  it("shows missing steps with a jump button when the backend reports them", async () => {
    server.use(
      http.post(`${BASE}/businesses/me/onboarding/complete/`, () =>
        HttpResponse.json(
          { missing_steps: ["services", "whatsapp"] },
          { status: 400 },
        ),
      ),
    );

    renderStep(<StepConfirmar />);

    await userEvent.click(
      await screen.findByRole("button", { name: /activar negocio/i }),
    );

    // The missing-steps panel is the alert region; "services" maps to step 4
    // (Servicios) and "whatsapp" to step 6 (WhatsApp).
    const alert = await screen.findByRole("alert");
    const jumpButtons = await screen.findAllByRole("button", {
      name: /ir al paso/i,
    });
    expect(jumpButtons).toHaveLength(2);
    expect(within(alert).getByText("Servicios")).toBeInTheDocument();
    expect(within(alert).getByText("WhatsApp")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
