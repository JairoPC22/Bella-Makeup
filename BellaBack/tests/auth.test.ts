// tests/auth.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";

describe("POST /api/auth/login", () => {
  beforeAll(async () => {
    const role = await prisma.role.upsert({
      where: { code: "test_role" },
      update: {},
      create: { code: "test_role", name: "Test", description: "test" },
    });
    await prisma.user.upsert({
      where: { username: "testuser" },
      update: {},
      create: {
        firstName: "Test", lastName: "User", displayName: "Test User",
        username: "testuser", email: "testuser@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"),
        avatarSeed: "test-seed", roleId: role.id,
      },
    });
  });

  it("logs in with valid credentials and sets cookies", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "testuser", password: "Password#123" });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("testuser");
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("rejects invalid credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "testuser", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("returns a JSON error message for invalid credentials", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "testuser", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.type).toBe("application/json");
    expect(typeof res.body.message).toBe("string");
  });

  it("rejects unauthenticated access to /api/auth/me", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 400 with JSON body for missing username", async () => {
    const res = await request(app).post("/api/auth/login").send({ password: "Password#123" });
    expect(res.status).toBe(400);
    expect(res.type).toBe("application/json");
    expect(res.body.message).toBeDefined();
  });
});

describe("POST /api/auth/refresh", () => {
  function extractCookie(setCookie: string[] | undefined, name: string): string | undefined {
    const raw = setCookie?.find((c) => c.startsWith(`${name}=`));
    return raw?.split(";")[0];
  }

  it("rotates the refresh token: issues a new one and invalidates the old one", async () => {
    const login = await request(app).post("/api/auth/login").send({ username: "testuser", password: "Password#123" });
    const oldRefreshCookie = extractCookie(login.headers["set-cookie"], "refresh_token");
    expect(oldRefreshCookie).toBeDefined();

    const refresh = await request(app).post("/api/auth/refresh").set("Cookie", [oldRefreshCookie!]);
    expect(refresh.status).toBe(200);
    const newRefreshCookie = extractCookie(refresh.headers["set-cookie"], "refresh_token");
    expect(newRefreshCookie).toBeDefined();
    // A genuinely rotated token must differ from the one that was presented.
    expect(newRefreshCookie).not.toBe(oldRefreshCookie);

    // The old refresh token must no longer work — it was revoked on rotation.
    const reuseOld = await request(app).post("/api/auth/refresh").set("Cookie", [oldRefreshCookie!]);
    expect(reuseOld.status).toBe(401);

    // The new refresh token must work.
    const useNew = await request(app).post("/api/auth/refresh").set("Cookie", [newRefreshCookie!]);
    expect(useNew.status).toBe(200);
  });
});
