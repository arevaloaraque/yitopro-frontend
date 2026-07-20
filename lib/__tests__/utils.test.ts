import { describe, expect, it } from "vitest";

import { formatNumber, formatPrice } from "@/lib/utils";

describe("formatPrice", () => {
  it("shows decimals when the amount has them", () => {
    // Backend sends Decimal(…,2) like 15.25 — cents must not be rounded away.
    expect(formatPrice(15.25)).toMatch(/15[.,]25/);
  });

  it("pads non-integers to two decimals (15.5 → 15,50)", () => {
    expect(formatPrice(15.5)).toMatch(/15[.,]50/);
  });

  it("keeps whole amounts clean (no trailing ,00)", () => {
    expect(formatPrice(15)).not.toMatch(/15[.,]0/);
  });

  it("groups thousands and keeps decimals together", () => {
    // es-CL formats 1234567.89 as "$1.234.567,89": three group separators + decimals.
    expect(formatPrice(1234567.89)).toMatch(/1[.,]234[.,]567[.,]89/);
  });
});

describe("formatNumber", () => {
  it("returns empty string for empty / digitless input", () => {
    expect(formatNumber("")).toBe("");
    expect(formatNumber("()- ")).toBe("");
  });

  it("cleans dashes, parens and spaces before formatting", () => {
    // Same VE number written messily must land on the same grouped result.
    expect(formatNumber("+58 (414) 965-1952")).toBe("+58 414 965 1952");
  });

  it("formats Argentina mobile with the 9 prefix (+54 9 XX XXXX XXXX)", () => {
    expect(formatNumber("5491123456789")).toBe("+54 9 11 2345 6789");
  });

  it("formats Bolivia (+591 XXXX XXXX)", () => {
    expect(formatNumber("59171234567")).toBe("+591 7123 4567");
  });

  it("formats Brazil 9-digit mobile (+55 XX XXXXX XXXX)", () => {
    expect(formatNumber("5511912345678")).toBe("+55 11 91234 5678");
  });

  it("formats Chile in blocks of 4 (+56 9 XXXX XXXX)", () => {
    expect(formatNumber("56912345678")).toBe("+56 9 1234 5678");
  });

  it("formats Colombia (+57 XXX XXX XXXX)", () => {
    expect(formatNumber("573001234567")).toBe("+57 300 123 4567");
  });

  it("formats Ecuador (+593 XX XXX XXXX)", () => {
    expect(formatNumber("593991234567")).toBe("+593 99 123 4567");
  });

  it("formats Paraguay (+595 XXX XXX XXX)", () => {
    expect(formatNumber("595981234567")).toBe("+595 981 234 567");
  });

  it("formats Peru (+51 XXX XXX XXX)", () => {
    expect(formatNumber("51987654321")).toBe("+51 987 654 321");
  });

  it("formats Uruguay (+598 XX XXX XXX)", () => {
    expect(formatNumber("59891234567")).toBe("+598 91 234 567");
  });

  it("formats Venezuela (+58 XXX XXX XXXX)", () => {
    expect(formatNumber("584149651952")).toBe("+58 414 965 1952");
  });

  it("falls back to +digits when length doesn't match the country pattern", () => {
    // Unknown country code.
    expect(formatNumber("12025550123")).toBe("+12025550123");
    // Right country code, wrong length (e.g. a Chilean landline, not 9 XXXX XXXX).
    expect(formatNumber("56221234567")).toBe("+56221234567");
  });
});
