import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CustomerRating, ThreadRating } from "@/components/customers/rating";

/**
 * Two things can go wrong when showing a number that judges a person, and both are silent:
 *
 * 1. **Direction.** It rates the CUSTOMER, not the business. A bare "4,5" next to someone's
 *    name reads as their rating of us — the exact opposite of what it means.
 * 2. **A missing rating rendered as a bad one.** The evaluator ships OFF, waits 24 h after a
 *    thread closes, and skips what it cannot rate, so "no number" is the common case. A 0
 *    there reads as the worst possible score.
 */
describe("CustomerRating", () => {
  it("says «Sin calificar» instead of a zero when nothing was rated", () => {
    render(<CustomerRating avg={null} count={0} />);
    expect(screen.getByText("Sin calificar")).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.queryByText(/0\s*\/\s*5/)).toBeNull();
  });

  it("does not trust a count of 0 paired with an average", () => {
    // Defensive: a stale payload could carry an average with no conversations behind it.
    render(<CustomerRating avg={4.5} count={0} />);
    expect(screen.getByText("Sin calificar")).toBeTruthy();
  });

  it("shows the average as stars, with how many conversations back it", () => {
    render(<CustomerRating avg={4.5} count={2} />);
    // El dígito ya no se pinta: vive en el nombre accesible (coma decimal es-CL).
    expect(screen.getByLabelText("4,5 de 5")).toBeTruthy();
    expect(screen.queryByText("4,5")).toBeNull();
    expect(screen.getByText(/· 2 conversaciones/)).toBeTruthy();
  });

  it("agrees in number for a single conversation", () => {
    render(<CustomerRating avg={3} count={1} />);
    expect(screen.getByText(/· 1 conversación$/)).toBeTruthy();
  });

  it("rellena las estrellas EN PROPORCIÓN, sin redondear al alza", () => {
    // 4,5 sobre 5 = 90 % del ancho. Redondear a 5 estrellas exageraría el juicio
    // sobre una persona, que es justo lo que este componente existe para no hacer.
    const { container } = render(<CustomerRating avg={4.5} count={2} />);
    const fill = container.querySelector<HTMLElement>("[style*='width']");
    expect(fill?.style.width).toBe("90%");
  });

  it("no pinta relleno cuando el promedio es el mínimo posible", () => {
    const { container } = render(<CustomerRating avg={1} count={1} />);
    const fill = container.querySelector<HTMLElement>("[style*='width']");
    expect(fill?.style.width).toBe("20%");
  });

  it("oculta la cola de conversaciones en modo compacto", () => {
    render(<CustomerRating avg={4} count={2} compact />);
    expect(screen.getByLabelText("4 de 5")).toBeTruthy();
    expect(screen.queryByText(/conversaciones/)).toBeNull();
  });

  it("states WHOSE behaviour the number describes", () => {
    const { container } = render(<CustomerRating avg={4} count={1} />);
    const title = container.querySelector("[title]")?.getAttribute("title") ?? "";
    expect(title).toContain("comportamiento del cliente");
    // …and where it comes from, so nobody reads it as something a human typed.
    expect(title).toContain("automáticamente");
  });
});

describe("ThreadRating", () => {
  it.each([
    ["pending", "Sin calificar aún"],
    ["skipped", "No calificable"],
    ["failed", "No se pudo calificar"],
  ])("explains a missing rating for status %s", (status, label) => {
    render(<ThreadRating value={null} status={status} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it("falls back to a neutral label for a status it does not know", () => {
    render(<ThreadRating value={null} status="algo_nuevo" />);
    expect(screen.getByText("Sin calificar")).toBeTruthy();
  });

  it("shows the thread's own score as stars", () => {
    const { container } = render(<ThreadRating value={2} status="rated" />);
    expect(screen.getByLabelText("2 de 5")).toBeTruthy();
    expect(screen.queryByText("/5")).toBeNull();
    expect(container.querySelector<HTMLElement>("[style*='width']")?.style.width).toBe(
      "40%",
    );
  });
});
