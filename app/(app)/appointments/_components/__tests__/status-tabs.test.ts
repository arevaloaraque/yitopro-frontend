import { describe, expect, it } from "vitest";

import { statusLabel } from "../status-tabs";

describe("statusLabel", () => {
  it("traduce cada estado al español", () => {
    expect(statusLabel("all")).toBe("Todas");
    expect(statusLabel("scheduled")).toBe("Agendadas");
    expect(statusLabel("cancelled")).toBe("Canceladas");
    expect(statusLabel("completed")).toBe("Completadas");
    expect(statusLabel("no_show")).toBe("No asistió");
  });
});
