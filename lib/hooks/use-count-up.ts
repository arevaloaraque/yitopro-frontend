"use client";

import { useEffect, useState } from "react";

import { prefersReducedMotion } from "@/lib/motion";

/**
 * Count-up de un contador con `requestAnimationFrame` (~900 ms, ease-out).
 *
 * `enabled` en false devuelve el valor final desde el primer render. Se apaga
 * al cambiar de período: ahí lo que se quiere es COMPARAR el número nuevo con
 * el que había, y verlo trepar otra vez desde cero estorba en vez de adornar.
 * Con `prefers-reduced-motion` no anima nunca — no es estilo, es WCAG.
 */
export function useCountUp(target: number, enabled = true, durationMs = 900): number {
  const [value, setValue] = useState(() =>
    !enabled || prefersReducedMotion() ? target : 0,
  );

  useEffect(() => {
    // Dos razones para no animar, comprobadas ANTES de tocar rAF: la
    // preferencia de accesibilidad y un entorno sin `requestAnimationFrame`,
    // donde sin este corte el contador se quedaría en 0 para siempre. En ambos
    // casos se salta al valor final — vía `setTimeout` y no con un `setValue`
    // directo, que es un render en cascada desde el cuerpo del efecto
    // (`react-hooks/set-state-in-effect`).
    if (!enabled || prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      const id = setTimeout(() => setValue(target), 0);
      return () => clearTimeout(id);
    }
    let raf = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      setValue(Math.round(target * (1 - (1 - t) ** 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, durationMs]);

  return value;
}
