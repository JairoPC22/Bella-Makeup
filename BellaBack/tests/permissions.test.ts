// tests/permissions.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
  let userId: string;

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

    // Branch has no unique field to upsert against, so each run creates fresh rows;
    // afterAll (below) deletes them so re-runs never accumulate orphaned branches.
    const branchA = await prisma.branch.create({ data: { name: "Branch A Test" } });
    const branchB = await prisma.branch.create({ data: { name: "Branch B Test" } });
    branchAId = branchA.id;
    branchBId = branchB.id;

    const user = await prisma.user.upsert({
      where: { username: "cashier_perm_test" },
      update: { roleId: role.id },
      create: {
        firstName: "Cashier", lastName: "Test", displayName: "Cashier",
        username: "cashier_perm_test", email: "cashier_perm_test@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: role.id,
      },
    });
    userId = user.id;

    // The user's branch assignment is re-derived every run (rather than relying on
    // nested create on the user upsert) because the branch ids above are freshly
    // created each run and any assignment from a prior run pointed at now-deleted
    // branch rows.
    await prisma.userBranch.deleteMany({ where: { userId: user.id } });
    await prisma.userBranch.create({ data: { userId: user.id, branchId: branchA.id } });

    cashierToken = signAccessToken({ sub: user.id, roleId: role.id });
  });

  afterAll(async () => {
    // Clean up everything this file created that isn't idempotently upserted, so a
    // second back-to-back run of this file (or the full suite) starts from a clean
    // slate. userBranch rows cascade-delete when their branch is deleted, but we
    // delete them explicitly first for clarity/defensiveness.
    await prisma.userBranch.deleteMany({ where: { userId } });
    await prisma.branch.deleteMany({ where: { id: { in: [branchAId, branchBId] } } });
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
