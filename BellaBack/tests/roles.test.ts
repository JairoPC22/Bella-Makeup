import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

// The seeded "cashier" permission set — snapshotted from the DATABASE
// before this file mutates anything, never hardcoded.
//
// History of why it is derived rather than literal: a first version of this
// file hardcoded the pre-messaging set (missing messages.view/send) at three
// call sites, so every run silently stripped those two permissions from
// cashier. That was fixed by centralising the literal into one constant —
// but the constant itself then went stale AGAIN, twice, as later tasks added
// permissions to the cashier role in prisma/seed.ts (`cash.manage` for the
// caja feature, then returns.view/returns.create/shrinkage.view/
// shrinkage.create for devoluciones y mermas). Each time, this file's
// "restore" silently downgraded the cashier role mid-run and the affected
// feature's own test file failed with a wall of 403s that had nothing to do
// with its code — while passing in isolation, which is the most misleading
// possible symptom.
//
// Any literal list here is a copy of prisma/seed.ts that nothing forces
// anyone to update. Reading the role's real permissions at runtime removes
// the duplicate entirely: whatever the seed grants cashier today is exactly
// what gets restored, forever, with no maintenance.
let CASHIER_SEEDED_PERMISSIONS: string[] = [];

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

    // Snapshot the cashier role's REAL current permission set before any
    // test in this describe mutates it. Every restore below replays exactly
    // this, so the role is left byte-for-byte as the seed created it and no
    // later feature's permissions can be silently dropped.
    const seededCashier = await prisma.role.findUniqueOrThrow({
      where: { code: "cashier" },
      include: { rolePermissions: { include: { permission: true } } },
    });
    CASHIER_SEEDED_PERMISSIONS = seededCashier.rolePermissions.map((rp) => rp.permission.code);
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
      .send({ permissions: CASHIER_SEEDED_PERMISSIONS });
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

  // Review round 2 finding: nothing special-cased the "admin" role, and the
  // schema allowed an empty permissions array (the "validate codes exist"
  // check passes vacuously for []). PUT on admin's own role id with
  // permissions omitting roles.manage would strip admin's ability to ever
  // call this endpoint again — a system-wide lockout with no in-app
  // recovery, since there's no "other admin" once roles.manage is gone.
  it("refuses to strip roles.manage/roles.view from the admin role (would brick the system)", async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" }, include: { rolePermissions: { include: { permission: true } } } });
    const originalCodes = adminRole.rolePermissions.map((rp) => rp.permission.code).sort();

    const emptySet = await request(app)
      .put(`/api/roles/${adminRole.id}/permissions`)
      .set("Cookie", [cookie])
      .send({ permissions: [] });
    expect([400, 409]).toContain(emptySet.status);

    const missingRolesManage = await request(app)
      .put(`/api/roles/${adminRole.id}/permissions`)
      .set("Cookie", [cookie])
      .send({ permissions: originalCodes.filter((c) => c !== "roles.manage") });
    expect([400, 409]).toContain(missingRolesManage.status);

    // Confirm neither request actually mutated the role — read it back via
    // the real GET endpoint, not just trust the HTTP status of the PUTs.
    const list = await request(app).get("/api/roles").set("Cookie", [cookie]);
    const adminAfter = list.body.find((r: any) => r.code === "admin");
    expect(adminAfter.permissions.sort()).toEqual(originalCodes);
  });

  it("logs an audit entry with the added/removed permission diff, not just the resulting set", async () => {
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });

    await request(app)
      .put(`/api/roles/${cashierRole.id}/permissions`)
      .set("Cookie", [cookie])
      .send({ permissions: [...CASHIER_SEEDED_PERMISSIONS, "reports.view"] });

    const entry = await prisma.auditLog.findFirst({
      where: { action: "roles.update_permissions", entityId: cashierRole.id },
      orderBy: { createdAt: "desc" },
    });
    expect(entry).not.toBeNull();
    const details = entry!.details as any;
    expect(details.added).toEqual(["reports.view"]);
    expect(details.removed).toEqual([]);

    // Restore the seeded cashier permission set.
    await request(app)
      .put(`/api/roles/${cashierRole.id}/permissions`)
      .set("Cookie", [cookie])
      .send({ permissions: CASHIER_SEEDED_PERMISSIONS });
  });
});

describe("POST /api/roles and DELETE /api/roles/:id", () => {
  let cookie: string;

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const user = await prisma.user.upsert({
      where: { username: "roles_crud_test_admin" },
      update: {},
      create: {
        firstName: "RolesCrud", lastName: "Admin", displayName: "RolesCrud Admin",
        username: "roles_crud_test_admin", email: "roles_crud_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    cookie = `access_token=${signAccessToken({ sub: user.id, roleId: adminRole.id })}`;
  });

  it("creates a custom role with a chosen permission set and lets it be deleted", async () => {
    const create = await request(app)
      .post("/api/roles")
      .set("Cookie", [cookie])
      .send({
        code: "marketing_test",
        name: "Marketing (test)",
        description: "Rol de prueba para marketing",
        permissions: ["products.view", "reports.view"],
      });
    expect(create.status).toBe(201);
    expect(create.body.code).toBe("marketing_test");
    expect(create.body.isSystem).toBe(false);
    expect(create.body.permissions.sort()).toEqual(["products.view", "reports.view"]);
    expect(create.body.assignedUsersCount).toBe(0);

    const createEntry = await prisma.auditLog.findFirst({
      where: { action: "roles.create", entityId: create.body.id },
    });
    expect(createEntry).not.toBeNull();

    const del = await request(app).delete(`/api/roles/${create.body.id}`).set("Cookie", [cookie]);
    expect(del.status).toBe(204);

    const list = await request(app).get("/api/roles").set("Cookie", [cookie]);
    expect(list.body.some((r: any) => r.id === create.body.id)).toBe(false);

    const deleteEntry = await prisma.auditLog.findFirst({
      where: { action: "roles.delete", entityId: create.body.id },
    });
    expect(deleteEntry).not.toBeNull();
  });

  it("rejects a duplicate role code with 409", async () => {
    const res = await request(app)
      .post("/api/roles")
      .set("Cookie", [cookie])
      .send({ code: "cashier", name: "Duplicado", description: "x", permissions: [] });
    expect(res.status).toBe(409);
  });

  it("rejects an unknown permission code on create with 400", async () => {
    const res = await request(app)
      .post("/api/roles")
      .set("Cookie", [cookie])
      .send({ code: "temp_role_bad_perm", name: "Temp", description: "x", permissions: ["not.a.real.permission"] });
    expect(res.status).toBe(400);
  });

  it("rejects malformed role codes with 400", async () => {
    const res = await request(app)
      .post("/api/roles")
      .set("Cookie", [cookie])
      .send({ code: "Not A Valid Code!", name: "Temp", description: "x", permissions: [] });
    expect(res.status).toBe(400);
  });

  it("refuses to delete a seeded system role", async () => {
    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { code: "viewer" } });
    const res = await request(app).delete(`/api/roles/${viewerRole.id}`).set("Cookie", [cookie]);
    expect(res.status).toBe(400);

    const list = await request(app).get("/api/roles").set("Cookie", [cookie]);
    expect(list.body.some((r: any) => r.code === "viewer")).toBe(true);
  });

  it("refuses to delete a non-system role that still has users assigned", async () => {
    // Unique code per run (not a fixed literal) so a prior run that got
    // killed before its own cleanup ran (e.g. an OOM'd test process) never
    // leaves behind a row that collides with this test on the next run.
    const code = `temp_role_with_users_${Date.now()}`;
    const created = await request(app)
      .post("/api/roles")
      .set("Cookie", [cookie])
      .send({ code, name: "Temp con usuarios", description: "x", permissions: [] });
    expect(created.status).toBe(201);

    const username = `roles_crud_test_member_${Date.now()}`;
    const member = await prisma.user.create({
      data: {
        firstName: "Member", lastName: "T", displayName: "Member T", username,
        email: `${username}@bellamakeup.demo`, passwordHash: await hashPassword("Password#123"),
        avatarSeed: "seed", roleId: created.body.id, allBranches: true,
      },
    });

    const blocked = await request(app).delete(`/api/roles/${created.body.id}`).set("Cookie", [cookie]);
    expect(blocked.status).toBe(409);

    // The role can't be deleted through the API while it still has a
    // member (that's the behavior under test) — clean up directly via
    // Prisma so this test doesn't leak rows into later runs.
    await prisma.user.delete({ where: { id: member.id } });
    await prisma.role.delete({ where: { id: created.body.id } });
  });

  it("rejects requests without roles.manage permission", async () => {
    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { code: "viewer" } });
    const viewer = await prisma.user.upsert({
      where: { username: "roles_crud_test_viewer" },
      update: {},
      create: {
        firstName: "V", lastName: "T", displayName: "V T", username: "roles_crud_test_viewer",
        email: "roles_crud_test_viewer@bellamakeup.demo", passwordHash: await hashPassword("Password#123"),
        avatarSeed: "seed", roleId: viewerRole.id, allBranches: true,
      },
    });
    const viewerCookie = `access_token=${signAccessToken({ sub: viewer.id, roleId: viewerRole.id })}`;
    const res = await request(app)
      .post("/api/roles")
      .set("Cookie", [viewerCookie])
      .send({ code: "temp_role_forbidden", name: "Temp", description: "x", permissions: [] });
    expect(res.status).toBe(403);
  });
});
