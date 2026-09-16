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

  it("rejects unauthenticated access to /api/auth/me", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
