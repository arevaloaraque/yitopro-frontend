import { describe, expect, it } from "vitest";

import { messageForStatus, titleForStatus } from "@/lib/errors";

describe("titleForStatus", () => {
  it("returns the right title per status", () => {
    expect(titleForStatus(401)).toMatch(/Sesión/i);
    expect(titleForStatus(403)).toMatch(/denegado/i);
    expect(titleForStatus(404)).toMatch(/no encontrada/i);
    expect(titleForStatus(503)).toMatch(/servidor/i);
  });
});

describe("messageForStatus", () => {
  it("treats unknown 5xx as server error", () => {
    expect(messageForStatus(502)).toMatch(/servidor/i);
  });
});
