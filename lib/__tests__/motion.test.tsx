/**
 * El guard del módulo de movimiento.
 *
 * Lo que se prueba aquí es lo que puede dejar la pantalla EN BLANCO: `useReveal`
 * oculta antes de animar, así que si se saltara el guard —o si la animación no
 * llegara a arrancar— el contenido no volvería nunca. La animación en sí se
 * verifica en navegador real (jsdom no tiene composición ni WAAPI); estos tests
 * fijan los caminos en los que el módulo NO debe tocar ni un estilo.
 */
import { useRef } from "react";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { prefersReducedMotion, useReveal } from "@/lib/motion";

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
}

function Subject({ enabled }: { enabled: boolean }) {
  // El hook RECIBE la ref (tres hooks comparten el contenedor de la página y un
  // nodo del DOM no admite tres refs).
  const ref = useRef<HTMLDivElement>(null);
  useReveal(ref, enabled);
  return (
    <div ref={ref}>
      <article data-reveal data-testid="card">
        contenido
      </article>
    </div>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("prefersReducedMotion", () => {
  it("refleja la media query del sistema", () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe("useReveal", () => {
  it("con prefers-reduced-motion no oculta nada", () => {
    stubMatchMedia(true);
    const { getByTestId } = render(<Subject enabled />);
    // Ni `opacity` ni `transform` en línea: el markup queda como estaba.
    expect(getByTestId("card").getAttribute("style")).toBeFalsy();
  });

  it("con enabled en false no oculta nada aunque se permita el movimiento", () => {
    stubMatchMedia(false);
    const { getByTestId } = render(<Subject enabled={false} />);
    expect(getByTestId("card").getAttribute("style")).toBeFalsy();
  });

  it("al desmontar devuelve la visibilidad, pase lo que pase con la animación", () => {
    // La red de seguridad: si el import de anime.js nunca resolviera, el
    // contenido no puede quedarse escondido.
    stubMatchMedia(false);
    const { getByTestId, unmount } = render(<Subject enabled />);
    const card = getByTestId("card");
    expect(card.style.opacity).toBe("0"); // ocultado síncrono, antes del paint
    unmount();
    expect(card.style.opacity).toBe("");
    expect(card.style.transform).toBe("");
  });
});
