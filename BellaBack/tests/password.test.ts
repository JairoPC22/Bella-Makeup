import { describe, it, expect } from "vitest";
import { hashPassword, comparePassword } from "../src/utils/password";

describe("password utils", () => {
  it("hashes a password and can verify it", async () => {
    const hash = await hashPassword("BellaAdmin#2026");
    expect(hash).not.toBe("BellaAdmin#2026");
    expect(await comparePassword("BellaAdmin#2026", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("BellaAdmin#2026");
    expect(await comparePassword("wrong-password", hash)).toBe(false);
  });
});
