import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

describe("GET /api/roles", () => {
  let cookie: string;

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const user = await prisma.user.upsert({
      where: { username: "roles_test_admin" },
      update: {},
      create: {
        firstName: "Roles", lastName: "Admin", displayName: "Roles Admin",
        username: "roles_test_admin", email: "roles_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    cookie = `access_token=${signAccessToken({ sub: user.id, roleId: adminRole.id })}`;
  });

  it("lists roles with descriptions, permissions and assigned user counts", async () => {
    const res = await request(app).get("/api/roles").set("Cookie", [cookie]);
    expect(res.status).toBe(200);
    const cashier = res.body.find((r: any) => r.code === "cashier");
    expect(cashier.description).toContain("Realiza ventas");
    expect(cashier.permissions).toContain("sales.create");
    expect(typeof cashier.assignedUsersCount).toBe("number");
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/roles");
    expect(res.status).toBe(401);
  });
});
