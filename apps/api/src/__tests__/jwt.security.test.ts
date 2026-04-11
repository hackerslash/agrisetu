import { afterEach, describe, expect, test, vi } from "vitest";

const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;

afterEach(() => {
  vi.resetModules();
  if (ORIGINAL_JWT_SECRET === undefined) {
    delete process.env.JWT_SECRET;
  } else {
    process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
  }
});

describe("JWT env hardening", () => {
  test("fails to initialize when JWT_SECRET is missing", async () => {
    delete process.env.JWT_SECRET;
    await expect(import("../lib/jwt.js")).rejects.toThrow(
      "JWT_SECRET is required.",
    );
  });

  test("fails to initialize when JWT_SECRET is too short", async () => {
    process.env.JWT_SECRET = "short-secret";
    await expect(import("../lib/jwt.js")).rejects.toThrow(
      "JWT_SECRET must be at least 32 characters.",
    );
  });
});
