import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CharCountInput } from "@/components/ui/char-count-input";

/**
 * `maxLength` truncates a pasted value in complete silence. That silence had two costs: the
 * operator never learns their 300-character service name was cut, and the server's own
 * validation became unreachable from the UI — which is why a QA pass concluded "the backend
 * accepts an over-long name" when the backend had never received one (2026-07-30).
 */
describe("CharCountInput", () => {
  it("stays out of the way well below the cap", () => {
    render(
      <CharCountInput id="f" max={120} value="Ana Fuentes" onChange={vi.fn()} />,
    );
    expect(screen.queryByText(/\/120/)).toBeNull();
    expect(screen.queryByText(/Máximo/)).toBeNull();
    // The native cap is still there — the counter is about telling, not about limiting.
    expect(screen.getByRole("textbox")).toHaveAttribute("maxlength", "120");
  });

  it("shows the count as the cap gets close", () => {
    render(<CharCountInput id="f" max={10} value="12345678" onChange={vi.fn()} />);
    expect(screen.getByText("8/10")).toBeTruthy();
  });

  it("says the value was cut once it sits exactly at the cap", () => {
    // What a truncated paste looks like from the DOM's side: there is no event to observe
    // after the fact, only a value of exactly `max` length.
    render(<CharCountInput id="f" max={10} value="1234567890" onChange={vi.fn()} />);
    const notice = screen.getByText(/Máximo 10 caracteres/);
    expect(notice.textContent).toContain("se recortó");
    // Announced, not merely visible.
    expect(notice).toHaveAttribute("role", "status");
  });

  it("announces the counter with the field, keeping any error id", () => {
    render(
      <CharCountInput
        id="f"
        max={10}
        value="123456789"
        onChange={vi.fn()}
        describedBy="f-error"
      />,
    );
    expect(screen.getByRole("textbox").getAttribute("aria-describedby")).toBe(
      "f-error f-count",
    );
  });

  it("does not describe the field by a counter that is not rendered", () => {
    render(
      <CharCountInput id="f" max={100} value="hola" onChange={vi.fn()} describedBy="f-error" />,
    );
    expect(screen.getByRole("textbox").getAttribute("aria-describedby")).toBe("f-error");
  });

  it("hands back the raw value, not the event", () => {
    const onChange = vi.fn();
    render(<CharCountInput id="f" max={10} value="" onChange={onChange} />);
    const input = screen.getByRole("textbox") as HTMLInputElement;
    input.focus();
    // Simulate a real edit through React's onChange plumbing.
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, "hola");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith("hola");
  });
});
