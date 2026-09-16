import { describe, it, expect } from "vitest";
import { generateRandomSeed, buildAvatarUrl } from "../src/utils/avatar";

describe("avatar utils", () => {
  it("generates a non-empty random seed", () => {
    const seed = generateRandomSeed();
    expect(seed.length).toBeGreaterThan(0);
  });

  it("builds a DiceBear adventurer URL from style and seed", () => {
    const url = buildAvatarUrl("adventurer", "bella-admin");
    expect(url).toBe("https://api.dicebear.com/9.x/adventurer/svg?seed=bella-admin");
  });
});
