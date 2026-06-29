import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ScheduleWindow } from "@/lib/types";
import { server } from "@/mocks/server";

import { StepHorarios, buildWindows } from "../_components/step-horarios";
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

describe("buildWindows", () => {
  it("emits one window per open day per valid range and drops invalid/closed days", () => {
    const windows = buildWindows([
      { open: true, ranges: [{ start: "09:00", end: "13:00" }, { start: "15:00", end: "18:00" }] }, // Mon (0)
      { open: false, ranges: [{ start: "09:00", end: "18:00" }] }, // Tue closed
      { open: true, ranges: [{ start: "10:00", end: "10:00" }] }, // Wed invalid (start==end)
      { open: false, ranges: [] },
      { open: false, ranges: [] },
      { open: false, ranges: [] },
      { open: false, ranges: [] },
    ]);

    expect(windows).toEqual<ScheduleWindow[]>([
      { day_of_week: 0, start_time: "09:00", end_time: "13:00" },
      { day_of_week: 0, start_time: "15:00", end_time: "18:00" },
    ]);
  });
});

describe("StepHorarios", () => {
  it("seeds the grid from context weeklySchedule on mount — saved Mon appears open", async () => {
    server.use(
      http.get(`${BASE}/businesses/me/schedule/`, () =>
        HttpResponse.json([{ day_of_week: 0, start_time: "09:00", end_time: "18:00" }]),
      ),
    );

    renderStep(<StepHorarios />);

    // Wait for load; then Lunes switch should be checked
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: /lunes abierto/i }),
      ).toBeChecked(),
    );
  });

  it("applies the Lun–Vie preset to all professionals via saveWeeklySchedule", async () => {
    let put: ScheduleWindow[] | undefined;
    server.use(
      http.put(`${BASE}/businesses/me/schedule/`, async ({ request }) => {
        put = (await request.json()) as ScheduleWindow[];
        return HttpResponse.json({ professionals_updated: 1 });
      }),
    );

    renderStep(<StepHorarios />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Lun–Vie 9:00–18:00/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /aplicar a todos los profesionales/i }),
    );

    await waitFor(() => expect(put).toBeDefined());
    // Mon–Fri (day_of_week 0..4), 09:00–18:00, no weekend entries.
    expect(put).toEqual([
      { day_of_week: 0, start_time: "09:00", end_time: "18:00" },
      { day_of_week: 1, start_time: "09:00", end_time: "18:00" },
      { day_of_week: 2, start_time: "09:00", end_time: "18:00" },
      { day_of_week: 3, start_time: "09:00", end_time: "18:00" },
      { day_of_week: 4, start_time: "09:00", end_time: "18:00" },
    ]);
  });

  it("per-professional override shows the professional NAME in the trigger after selection", async () => {
    // Provide a professional so the override panel is visible
    mockRehydration({
      professionals: [{ id: "pro-1", name: "María Pérez", active: true }],
    });
    // Return empty schedule so the override fetch succeeds
    server.use(
      http.get(`${BASE}/professionals/pro-1/schedule/`, () =>
        HttpResponse.json([]),
      ),
    );

    renderStep(<StepHorarios />);

    // Open the override panel
    const overrideButton = await screen.findByRole("button", {
      name: /algún profesional con horario distinto/i,
    });
    await userEvent.click(overrideButton);

    // Open the select
    const trigger = await screen.findByRole("combobox");
    await userEvent.click(trigger);

    // Pick "María Pérez" from the dropdown
    const option = await screen.findByRole("option", { name: /maría pérez/i });
    await userEvent.click(option);

    // The trigger should now show the name, not the id
    await waitFor(() => {
      // The trigger element should contain the professional's name
      expect(within(trigger).getByText("María Pérez")).toBeInTheDocument();
    });
    expect(within(trigger).queryByText("pro-1")).not.toBeInTheDocument();
  });
});
