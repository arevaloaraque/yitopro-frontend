import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/mocks/server";

import { Step3Services } from "../_components/step-3-services";
import { Step6Agents } from "../_components/step-6-agents";
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
});

describe("Step3Services (adapted)", () => {
  it("adds a service via the form and renders it", async () => {
    mockRehydration();
    let posted: unknown;
    server.use(
      http.post(`${BASE}/services/`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(
          {
            id: 5,
            name: "Baño",
            description: "",
            duration_minutes: 45,
            price: "12000",
            active: true,
          },
          { status: 201 },
        );
      }),
    );

    renderStep(<Step3Services />);

    await userEvent.type(
      await screen.findByLabelText("Nuevo servicio"),
      "Baño",
    );
    await userEvent.clear(screen.getByLabelText("Duración (min)"));
    await userEvent.type(screen.getByLabelText("Duración (min)"), "45");
    await userEvent.clear(screen.getByLabelText("Precio"));
    await userEvent.type(screen.getByLabelText("Precio"), "12000");
    await userEvent.click(
      screen.getByRole("button", { name: /agregar servicio/i }),
    );

    await waitFor(() =>
      expect(posted).toEqual({
        name: "Baño",
        duration_minutes: 45,
        price: 12000,
        active: true,
      }),
    );
    expect(await screen.findByDisplayValue("Baño")).toBeInTheDocument();
  });

  it("inline-edits a service name only on blur, not per keystroke", async () => {
    // Backend shape: numeric id, price as string, active (not is_active)
    mockRehydration({
      services: [
        { id: 10, name: "Corte", duration_minutes: 30, price: "5000", active: true },
      ],
    });

    const patches: unknown[] = [];
    server.use(
      http.patch(`${BASE}/services/10/`, async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json({
          id: 10,
          name: "Corte Premium",
          duration_minutes: 30,
          price: "5000",
          active: true,
        });
      }),
    );

    renderStep(<Step3Services />);

    const nameInput = await screen.findByDisplayValue("Corte");

    // Type into the field — no PATCH should fire during typing
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Corte Premium");
    expect(patches).toHaveLength(0);

    // Blur triggers the PATCH exactly once with the final value
    fireEvent.blur(nameInput);
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toMatchObject({ name: "Corte Premium" });
  });

  it("does not PATCH when blurring with an unchanged service name", async () => {
    mockRehydration({
      services: [
        { id: 11, name: "Baño", duration_minutes: 60, price: "8000", active: true },
      ],
    });

    const patches: unknown[] = [];
    server.use(
      http.patch(`${BASE}/services/11/`, async ({ request }) => {
        patches.push(await request.json());
        return HttpResponse.json({
          id: 11,
          name: "Baño",
          duration_minutes: 60,
          price: "8000",
          active: true,
        });
      }),
    );

    renderStep(<Step3Services />);

    const nameInput = await screen.findByDisplayValue("Baño");
    fireEvent.blur(nameInput);

    // Give any potential async request a chance to fire
    await new Promise((r) => setTimeout(r, 50));
    expect(patches).toHaveLength(0);
  });
});

describe("Step6Agents (adapted)", () => {
  it("renders available agents and toggles by agent.type", async () => {
    mockRehydration({
      agents: {
        items: [
          {
            id: "scheduling",
            business_id: "1",
            name: "Agente de agenda",
            type: "scheduling",
            is_active: false,
            autonomy: "supervised",
            skills: ["agendar"],
            tools: [],
            escalation_rules: [],
          },
        ],
        count: 1,
      },
    });

    let patchedPath: string | undefined;
    let patchBody: unknown;
    server.use(
      http.patch(`${BASE}/agents/:type/`, async ({ request, params }) => {
        patchedPath = String(params.type);
        patchBody = await request.json();
        return HttpResponse.json({
          id: "scheduling",
          business_id: "1",
          name: "Agente de agenda",
          type: "scheduling",
          is_active: true,
          autonomy: "supervised",
          skills: ["agendar"],
          tools: [],
          escalation_rules: [],
        });
      }),
    );

    renderStep(<Step6Agents />);

    expect(await screen.findByText("Agente de agenda")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch"));

    await waitFor(() => expect(patchBody).toEqual({ is_active: true }));
    // addressed by agent.type, not a numeric id
    expect(patchedPath).toBe("scheduling");
  });
});
