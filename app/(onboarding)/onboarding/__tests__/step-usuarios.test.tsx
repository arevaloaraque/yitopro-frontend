import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/mocks/server";

import { StepUsuarios } from "../_components/step-usuarios";
import {
  BASE,
  mockAuthenticatedSession,
  mockRehydration,
  renderStep,
} from "./test-utils";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthenticatedSession();
  mockRehydration();
});

describe("StepUsuarios", () => {
  it("invites a user via the form and renders the new row", async () => {
    let posted: unknown;
    server.use(
      http.post(`${BASE}/users/`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(
          { id: 22, email: "staff@petspa.cl", role: "staff", is_active: true },
          { status: 201 },
        );
      }),
    );

    renderStep(<StepUsuarios />);

    // owner row from rehydration
    expect(await screen.findByText("owner@petspa.cl")).toBeInTheDocument();

    await userEvent.type(
      screen.getByLabelText("Correo"),
      "staff@petspa.cl",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /invitar usuario/i }),
    );

    await waitFor(() =>
      expect(posted).toEqual({ email: "staff@petspa.cl", role: "staff" }),
    );
    expect(await screen.findByText("staff@petspa.cl")).toBeInTheDocument();
  });

  it("always invites as staff — no Dueño/owner option in the form", () => {
    renderStep(<StepUsuarios />);

    // No role selector should be present in the invite form
    expect(
      screen.queryByRole("combobox", { name: /rol/i }),
    ).not.toBeInTheDocument();
    // The text "Dueño" must not appear as a form option (it may appear as a
    // badge for the existing owner row in the list, so we check for the
    // select/option context specifically by the absence of the selector)
    expect(
      screen.queryByRole("option", { name: /dueño/i }),
    ).not.toBeInTheDocument();
  });

  it("inviteUser is always called with role 'staff'", async () => {
    let posted: unknown;
    server.use(
      http.post(`${BASE}/users/`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(
          { id: 23, email: "newstaff@petspa.cl", role: "staff", is_active: true },
          { status: 201 },
        );
      }),
    );

    renderStep(<StepUsuarios />);

    await screen.findByText("owner@petspa.cl"); // wait for rehydration

    await userEvent.type(
      screen.getByLabelText("Correo"),
      "newstaff@petspa.cl",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /invitar usuario/i }),
    );

    await waitFor(() =>
      expect(posted).toMatchObject({ role: "staff" }),
    );
    // Must NOT contain role: "owner"
    expect((posted as { role: string }).role).toBe("staff");
  });
});
