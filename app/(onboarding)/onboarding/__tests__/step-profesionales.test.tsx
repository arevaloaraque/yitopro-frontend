import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/mocks/server";

import { StepProfesionales } from "../_components/step-profesionales";
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

describe("StepProfesionales", () => {
  it("adds a professional via the form and renders it", async () => {
    let posted: unknown;
    server.use(
      http.post(`${BASE}/professionals/`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(
          { id: 7, name: "María Pérez", active: true },
          { status: 201 },
        );
      }),
    );

    renderStep(<StepProfesionales />);

    const input = await screen.findByLabelText("Nuevo profesional");
    await userEvent.type(input, "María Pérez");
    await userEvent.click(
      screen.getByRole("button", { name: /agregar profesional/i }),
    );

    await waitFor(() =>
      expect(posted).toEqual({ name: "María Pérez", active: true }),
    );
    expect(
      await screen.findByDisplayValue("María Pérez"),
    ).toBeInTheDocument();
  });

  it("inline-edits a professional name only on blur, not per keystroke", async () => {
    // Backend shape: numeric id, active (not is_active)
    mockRehydration({
      professionals: [{ id: 3, name: "Juan López", active: true }],
    });

    const patches: unknown[] = [];
    server.use(
      http.patch(`${BASE}/professionals/3/`, async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json({ id: 3, name: "Juan López García", active: true });
      }),
    );

    renderStep(<StepProfesionales />);

    const input = await screen.findByDisplayValue("Juan López");

    // Type a new name — no PATCH should fire mid-typing
    await userEvent.clear(input);
    await userEvent.type(input, "Juan López García");
    expect(patches).toHaveLength(0);

    // Blur triggers exactly one PATCH with the final value
    fireEvent.blur(input);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toMatchObject({ name: "Juan López García" });
  });

  it("does not PATCH when blurring with an unchanged professional name", async () => {
    mockRehydration({
      professionals: [{ id: 4, name: "Ana Rivas", active: true }],
    });

    const patches: unknown[] = [];
    server.use(
      http.patch(`${BASE}/professionals/4/`, async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json({ id: 4, name: "Ana Rivas", active: true });
      }),
    );

    renderStep(<StepProfesionales />);

    const input = await screen.findByDisplayValue("Ana Rivas");
    fireEvent.blur(input);

    await new Promise((r) => setTimeout(r, 50));
    expect(patches).toHaveLength(0);
  });
});
