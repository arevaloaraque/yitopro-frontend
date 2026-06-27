import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { friendlyMessage, messageForStatus, titleForStatus } from "@/lib/errors";

describe("friendlyMessage", () => {
  it("maps ApiError status to a safe Spanish message", () => {
    expect(friendlyMessage(new ApiError(403, "Forbidden"))).toMatch(/permiso/i);
    expect(friendlyMessage(new ApiError(404, "x"))).toMatch(/encontramos/i);
    expect(friendlyMessage(new ApiError(500, "boom"))).toMatch(/servidor/i);
    expect(friendlyMessage(new ApiError(0, "net"))).toMatch(/conectar/i);
  });

  it("never leaks the technical message", () => {
    const msg = friendlyMessage(
      new ApiError(500, "TypeError: cannot read 'x' of undefined at foo.ts:42"),
    );
    expect(msg).not.toMatch(/TypeError|undefined|\.ts:/);
  });

  it("falls back for non-ApiError errors", () => {
    expect(friendlyMessage(new Error("internal boom"))).toMatch(/Algo salió mal/i);
    expect(friendlyMessage("weird")).toMatch(/Algo salió mal/i);
  });
});

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
