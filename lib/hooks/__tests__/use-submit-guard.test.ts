import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSubmitGuard } from "@/lib/hooks/use-submit-guard";

describe("useSubmitGuard", () => {
  it("doble disparo síncrono: la fn interna corre una sola vez", async () => {
    const { result } = renderHook(() => useSubmitGuard());
    let release!: () => void;
    const fn = vi.fn(() => new Promise<void>((r) => (release = r)));

    const first = result.current(fn);
    const second = result.current(fn); // ignorado: la primera sigue en vuelo
    expect(fn).toHaveBeenCalledTimes(1);

    release();
    await Promise.all([first, second]);

    // Tras resolverse, el guard se libera y permite un nuevo envío.
    const third = result.current(fn);
    expect(fn).toHaveBeenCalledTimes(2);
    release();
    await third;
  });

  it("se libera aunque la fn interna lance", async () => {
    const { result } = renderHook(() => useSubmitGuard());
    const boom = vi.fn(() => Promise.reject(new Error("boom")));
    await expect(result.current(boom)).rejects.toThrow("boom");
    const ok = vi.fn();
    await result.current(ok);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
