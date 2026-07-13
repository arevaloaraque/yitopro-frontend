/**
 * Services page — live refresh on service-catalog SSE events.
 *
 * When another operator or the onboarding wizard creates/edits/deletes a
 * service, the list must refetch instead of going stale.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Service, SSEEvent } from "@/lib/types";
import { searchServices } from "@/lib/api";

import ServicesPage from "../page";

vi.mock("@/lib/api");

const { sseHandlers } = vi.hoisted(() => ({
  sseHandlers: [] as ((event: SSEEvent) => void)[],
}));
vi.mock("@/lib/sse", () => ({
  subscribeToEvents: (handler: (event: SSEEvent) => void) => {
    sseHandlers.push(handler);
    return () => {};
  },
}));

function emitSse(event: SSEEvent) {
  for (const handler of sseHandlers) handler(event);
}

function makeService(over: Partial<Service> = {}): Service {
  return {
    id: "svc-1",
    name: "Baño",
    description: "",
    duration_minutes: 45,
    price: 12000,
    is_active: true,
    ...over,
  } as Service;
}

beforeEach(() => {
  vi.clearAllMocks();
  sseHandlers.length = 0;
  vi.mocked(searchServices).mockResolvedValue({ items: [makeService()], count: 1 });
});

describe("ServicesPage — SSE freshness", () => {
  it.each([
    ["servicio_creado", { service_id: "svc-2", active: true }],
    ["servicio_actualizado", { service_id: "svc-1", active: false }],
    ["servicio_eliminado", { service_id: "svc-1" }],
  ])("refetches the list on %s", async (type, data) => {
    render(<ServicesPage />);
    await waitFor(() => expect(searchServices).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Baño")).toBeInTheDocument();

    emitSse({
      id: "e1",
      type,
      emitted_at: "2026-07-11T10:01:00Z",
      data,
    } as SSEEvent);

    await waitFor(() => expect(searchServices).toHaveBeenCalledTimes(2));
  });
});
