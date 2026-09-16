import { describe, it, expect } from "vitest";
import { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } from "../src/utils/jwt";

describe("jwt utils", () => {
  it("round-trips an access token", () => {
    const token = signAccessToken({ sub: "user-1", roleId: "role-1" });
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe("user-1");
    expect(decoded.roleId).toBe("role-1");
  });

  it("round-trips a refresh token", () => {
    const token = signRefreshToken({ sub: "user-1" });
    const decoded = verifyRefreshToken(token);
    expect(decoded.sub).toBe("user-1");
  });

  it("throws on a tampered access token", () => {
    const token = signAccessToken({ sub: "user-1", roleId: "role-1" });
    expect(() => verifyAccessToken(token + "x")).toThrow();
  });
});
