import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ErrorState } from "@/components/states/error-state";

describe("ErrorState", () => {
  it("renders title + description and triggers onRetry", async () => {
    const onRetry = vi.fn();
    render(<ErrorState title="Uy" description="no se pudo" onRetry={onRetry} />);

    expect(screen.getByText("Uy")).toBeInTheDocument();
    expect(screen.getByText("no se pudo")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /reintentar/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("hides the retry button when onRetry is not provided", () => {
    render(<ErrorState title="solo" />);
    expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
  });
});
