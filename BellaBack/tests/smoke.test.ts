// tests/smoke.test.ts
import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app";

describe("full-stack smoke flow", () => {
  it("logs in as the seeded admin, reads /api/auth/me, lists branches, and logs out", async () => {
    const login = await request(app).post("/api/auth/login").send({ username: "admin", password: "BellaAdmin#2026" });
    expect(login.status).toBe(200);
    const cookies = login.headers["set-cookie"];

    const me = await request(app).get("/api/auth/me").set("Cookie", cookies);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe("admin");

    const branches = await request(app).get("/api/branches").set("Cookie", cookies);
    expect(branches.status).toBe(200);
    expect(branches.body.length).toBeGreaterThanOrEqual(2);

    const logout = await request(app).post("/api/auth/logout").set("Cookie", cookies);
    expect(logout.status).toBe(200);
  });
});
