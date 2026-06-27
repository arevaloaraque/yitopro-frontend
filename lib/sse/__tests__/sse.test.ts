import { describe, expect, it } from "vitest";

import { mapSseEnvelope } from "@/lib/sse";

describe("mapSseEnvelope", () => {
  it("renames event->type, synthesizes id/emitted_at, coerces *_id to string, start_datetime->start", () => {
    const e = mapSseEnvelope({
      event: "nueva_cita",
      data: { appointment_id: 7, customer_id: 3, start_datetime: "2026-06-29T09:00:00Z" },
      correlation_id: "",
    });
    expect(e).toBeTruthy();
    const data = e!.data as Record<string, unknown>;
    expect(e!.type).toBe("nueva_cita");
    expect(e!.id).toMatch(/^evt_/);
    expect(typeof e!.emitted_at).toBe("string");
    expect(data.appointment_id).toBe("7");
    expect(data.customer_id).toBe("3");
    expect(data.start).toBe("2026-06-29T09:00:00Z");
  });

  it("maps slot->new_start for cita_reagendada", () => {
    const e = mapSseEnvelope({
      event: "cita_reagendada",
      data: { appointment_id: 1, slot: "2026-06-30T10:00:00Z" },
    });
    expect((e!.data as Record<string, unknown>).new_start).toBe("2026-06-30T10:00:00Z");
  });

  it("returns null for malformed envelopes", () => {
    expect(mapSseEnvelope({})).toBeNull();
    expect(mapSseEnvelope("x")).toBeNull();
    expect(mapSseEnvelope(null)).toBeNull();
  });
});
