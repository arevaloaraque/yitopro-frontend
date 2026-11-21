/**
 * `useCountUp`: el guard de accesibilidad es la primera comprobación — con
 * `prefers-reduced-motion: reduce` el contador NO anima y el valor final está
 * desde el primer render.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCountUp } from "@/lib/hooks/use-count-up";

const realMatchMedia = window.matchMedia;

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

describe("useCountUp", () => {
  it("con prefers-reduced-motion devuelve el valor final de inmediato", () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useCountUp(154));
    expect(result.current).toBe(154);
  });

  it("sin prefers-reduced-motion parte en 0 y termina en el valor", async () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useCountUp(154, true, 50));
    expect(result.current).toBe(0);
    // El timeout es explícito y holgado a propósito: con el 1 s por defecto este
    // test fallaba de forma intermitente SOLO dentro de la suite completa —el
    // archivo aislado pasa 8 de 8—, porque 519 tests en paralelo dejan sin
    // rebanada al temporizador de la animación. Lo que se verifica no cambia:
    // parte en 0 y acaba en el valor.
    await waitFor(() => expect(result.current).toBe(154), { timeout: 5000 });
  });

  it("con enabled en false no anima aunque se permita el movimiento", () => {
    // El caso del cambio de período: el número nuevo tiene que poder
    // compararse con el que había, no volver a trepar desde cero.
    stubMatchMedia(false);
    const { result } = renderHook(() => useCountUp(154, false));
    expect(result.current).toBe(154);
  });
});
