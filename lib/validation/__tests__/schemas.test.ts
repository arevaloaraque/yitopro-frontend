import { describe, expect, it } from "vitest";

import {
  customerSchema,
  loginSchema,
  productSchema,
  serviceSchema,
} from "@/lib/validation/schemas";

describe("loginSchema", () => {
  it("rejects empty fields and malformed email", () => {
    expect(loginSchema.safeParse({ email: "", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });
  it("accepts a valid pair", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });
});

describe("serviceSchema", () => {
  it("coerces numeric strings and rejects non-positive duration / empty name", () => {
    expect(serviceSchema.safeParse({ name: "Baño", duration_minutes: "30", price: "20" }).success).toBe(true);
    expect(serviceSchema.safeParse({ name: "Baño", duration_minutes: "0", price: "20" }).success).toBe(false);
    expect(serviceSchema.safeParse({ name: "", duration_minutes: "30", price: "20" }).success).toBe(false);
  });
});

describe("productSchema", () => {
  it("requires non-negative price and stock", () => {
    expect(productSchema.safeParse({ name: "P", price: "5", stock: "3", sellable_via_whatsapp: true }).success).toBe(true);
    expect(productSchema.safeParse({ name: "P", price: "-1", stock: "3", sellable_via_whatsapp: true }).success).toBe(false);
  });
});

describe("customerSchema", () => {
  it("validates the phone format", () => {
    expect(customerSchema.safeParse({ name: "Ana", phone: "+56912345678" }).success).toBe(true);
    expect(customerSchema.safeParse({ name: "Ana", phone: "abc" }).success).toBe(false);
  });
});
