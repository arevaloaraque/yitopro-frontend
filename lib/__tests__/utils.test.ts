import { describe, expect, it } from "vitest";

import { formatPrice } from "@/lib/utils";

describe("formatPrice", () => {
  it("shows decimals when the amount has them", () => {
    // Backend sends Decimal(…,2) like 15.25 — cents must not be rounded away.
    expect(formatPrice(15.25)).toMatch(/15[.,]25/);
  });

  it("shows a single decimal as-is", () => {
    expect(formatPrice(15.5)).toMatch(/15[.,]5/);
  });

  it("keeps whole amounts clean (no trailing ,00)", () => {
    expect(formatPrice(15)).not.toMatch(/15[.,]0/);
  });

  it("groups thousands and keeps decimals together", () => {
    // es-CL formats 1234567.89 as "$1.234.567,89": three group separators + decimals.
    expect(formatPrice(1234567.89)).toMatch(/1[.,]234[.,]567[.,]89/);
  });
});
