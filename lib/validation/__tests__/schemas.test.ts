import { describe, expect, it } from "vitest";

import { loginSchema } from "@/lib/validation/schemas";

describe("loginSchema", () => {
  it("rejects empty fields and malformed email", () => {
    expect(loginSchema.safeParse({ email: "", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });
  it("accepts a valid pair", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(
      true,
    );
  });
});
