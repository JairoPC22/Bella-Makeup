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

describe("PUT /api/roles/:id/permissions", () => {
  let cookie: string;

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const user = await prisma.user.upsert({
      where: { username: "roles_perm_test_admin" },
      update: {},
      create: {
        firstName: "RolesPerm", lastName: "Admin", displayName: "RolesPerm Admin",
        username: "roles_perm_test_admin", email: "roles_perm_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    cookie = `access_token=${signAccessToken({ sub: user.id, roleId: adminRole.id })}`;
  });

  it("replaces a role's permission set with a valid, known permission list", async () => {
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    const res = await request(app)
      .put(`/api/roles/${cashierRole.id}/permissions`)
      .set("Cookie", [cookie])
      .send({ permissions: ["products.view", "sales.view", "reports.view"] });

    expect(res.status).toBe(200);
    expect(res.body.permissions.sort()).toEqual(["products.view", "reports.view", "sales.view"]);

    // Restore the seeded cashier permission set so this test doesn't leak
    // state into other tests/manual QA that assume the seeded shape.
    await request(app)
      .put(`/api/roles/${cashierRole.id}/permissions`)
      .set("Cookie", [cookie])
      .send({ permissions: ["products.view", "inventory.view", "sales.view", "sales.create", "discounts.apply"] });
  });

  it("rejects unknown permission codes with 400", async () => {
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    const res = await request(app)
      .put(`/api/roles/${cashierRole.id}/permissions`)
      .set("Cookie", [cookie])
      .send({ permissions: ["not.a.real.permission"] });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a nonexistent role", async () => {
    const res = await request(app)
      .put("/api/roles/00000000-0000-0000-0000-000000000000/permissions")
      .set("Cookie", [cookie])
      .send({ permissions: ["products.view"] });
    expect(res.status).toBe(404);
  });

  it("rejects requests without roles.manage permission", async () => {
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { code: "viewer" } });
    const viewer = await prisma.user.upsert({
      where: { username: "roles_perm_test_viewer" },
      update: {},
      create: {
        firstName: "V", lastName: "T", displayName: "V T", username: "roles_perm_test_viewer",
        email: "roles_perm_test_viewer@bellamakeup.demo", passwordHash: await hashPassword("Password#123"),
        avatarSeed: "seed", roleId: viewerRole.id, allBranches: true,
      },
    });
    const viewerCookie = `access_token=${signAccessToken({ sub: viewer.id, roleId: viewerRole.id })}`;
    const res = await request(app)
      .put(`/api/roles/${cashierRole.id}/permissions`)
      .set("Cookie", [viewerCookie])
      .send({ permissions: ["products.view"] });
    expect(res.status).toBe(403);
  });
});
