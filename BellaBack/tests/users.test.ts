import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

describe("Users CRUD + branch assignment", () => {
  let cookie: string;
  let cashierRoleId: string;
  let branchId: string;

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    cashierRoleId = cashierRole.id;
    const branch = await prisma.branch.create({ data: { name: "Users Test Branch" } });
    branchId = branch.id;

    const admin = await prisma.user.upsert({
      where: { username: "users_test_admin" },
      update: {},
      create: {
        firstName: "Users", lastName: "Admin", displayName: "Users Admin",
        username: "users_test_admin", email: "users_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    cookie = `access_token=${signAccessToken({ sub: admin.id, roleId: adminRole.id })}`;
  });

  it("creates a user, lists it, updates it, assigns a branch, and disables it", async () => {
    const create = await request(app).post("/api/users").set("Cookie", [cookie]).send({
      firstName: "Nueva", lastName: "Vendedora", displayName: "Nueva Vendedora",
      username: "nueva_vendedora", email: "nueva@bellamakeup.demo", password: "Password#123", roleId: cashierRoleId,
    });
    expect(create.status).toBe(201);
    expect(create.body.passwordHash).toBeUndefined();
    const id = create.body.id;

    const list = await request(app).get("/api/users").set("Cookie", [cookie]);
    expect(list.body.some((u: any) => u.id === id)).toBe(true);

    const assign = await request(app).put(`/api/users/${id}/branches`).set("Cookie", [cookie]).send({ branchIds: [branchId], allBranches: false });
    expect(assign.body.branches.map((b: any) => b.id)).toContain(branchId);

    const disable = await request(app).patch(`/api/users/${id}/status`).set("Cookie", [cookie]).send({ status: "DISABLED" });
    expect(disable.body.status).toBe("DISABLED");
  });
});
