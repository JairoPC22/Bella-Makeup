// tests/permissions.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "../src/config/prisma";
import { requirePermission, requireBranchScope } from "../src/middleware/permissions";
import { signAccessToken } from "../src/utils/jwt";
import { hashPassword } from "../src/utils/password";
import cookieParser from "cookie-parser";
import { requireAuth } from "../src/middleware/auth";

describe("permission & branch-scope middleware", () => {
  let cashierToken: string;
  let branchAId: string;
  let branchBId: string;

  beforeAll(async () => {
    const role = await prisma.role.upsert({
      where: { code: "perm_test_role" },
      update: {},
      create: { code: "perm_test_role", name: "Perm Test", description: "test" },
    });
    const perm = await prisma.permission.upsert({
      where: { code: "sales.create" },
      update: {},
      create: { code: "sales.create", description: "Registrar ventas" },
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      update: {},
      create: { roleId: role.id, permissionId: perm.id },
    });
    const branchA = await prisma.branch.create({ data: { name: "Branch A Test" } });
    const branchB = await prisma.branch.create({ data: { name: "Branch B Test" } });
    branchAId = branchA.id;
    branchBId = branchB.id;

    const user = await prisma.user.create({
      data: {
        firstName: "Cashier", lastName: "Test", displayName: "Cashier",
        username: "cashier_perm_test", email: "cashier_perm_test@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: role.id,
        userBranches: { create: [{ branchId: branchA.id }] },
      },
    });
    cashierToken = signAccessToken({ sub: user.id, roleId: role.id });
  });

  function buildApp() {
    const app = express();
    app.use(cookieParser());
    app.get(
      "/protected/:branchId",
      requireAuth,
      requirePermission("sales.create"),
      requireBranchScope("branchId"),
      (_req, res) => res.json({ ok: true })
    );
    app.get("/forbidden-action/:branchId", requireAuth, requirePermission("branches.manage"), (_req, res) => res.json({ ok: true }));
    return app;
  }

  it("allows access to a branch the user is assigned to", async () => {
    const app = buildApp();
    const res = await request(app).get(`/protected/${branchAId}`).set("Cookie", [`access_token=${cashierToken}`]);
    expect(res.status).toBe(200);
  });

  it("denies access to a branch the user is NOT assigned to, even with a valid permission", async () => {
    const app = buildApp();
    const res = await request(app).get(`/protected/${branchBId}`).set("Cookie", [`access_token=${cashierToken}`]);
    expect(res.status).toBe(403);
  });

  it("denies access when the user's role lacks the required permission", async () => {
    const app = buildApp();
    const res = await request(app).get(`/forbidden-action/${branchAId}`).set("Cookie", [`access_token=${cashierToken}`]);
    expect(res.status).toBe(403);
  });
});
