import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

describe("Users CRUD + branch assignment", () => {
  let cookie: string;
  let adminRoleId: string;
  let cashierRoleId: string;
  let branchId: string;
  let createdUserId: string | undefined;
  let selfAdminId: string;
  let otherAdminId: string;

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    adminRoleId = adminRole.id;
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    cashierRoleId = cashierRole.id;

    // Branch has no unique field to upsert against, so each run creates a fresh row;
    // afterAll (below) deletes it so re-runs never accumulate orphaned branches.
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
    selfAdminId = admin.id;

    const otherAdmin = await prisma.user.upsert({
      where: { username: "users_test_other_admin" },
      update: {},
      create: {
        firstName: "Other", lastName: "Admin", displayName: "Other Admin",
        username: "users_test_other_admin", email: "users_test_other_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    otherAdminId = otherAdmin.id;

    // The user created inside the test below goes through POST /api/users, which has
    // no upsert semantics, and username/email are unique columns. A leftover row from
    // a prior run (e.g. a previous run that wasn't cleaned up) would make that create()
    // call fail with a P2002 unique-constraint 500. Clear it defensively up front so
    // this file is idempotent across repeated runs.
    await prisma.userBranch.deleteMany({ where: { user: { username: "nueva_vendedora" } } });
    await prisma.user.deleteMany({ where: { username: "nueva_vendedora" } });
  });

  afterAll(async () => {
    // Clean up everything this file created that isn't idempotently upserted, so a
    // second back-to-back run of this file (or the full suite) starts from a clean
    // slate and never accumulates orphaned rows.
    //
    // Guarded: if beforeAll threw before assigning createdUserId/branchId (e.g. a
    // transient DB error), vitest still runs afterAll with those vars left undefined.
    // Prisma treats an `undefined` filter value as "field not present" rather than
    // "match nothing," so an unguarded deleteMany({ where: { id } }) with id ===
    // undefined would silently become deleteMany({ where: {} }) and wipe every row in
    // the table. Only delete once we know we actually created something.
    if (createdUserId) {
      await prisma.userBranch.deleteMany({ where: { userId: createdUserId } });
      await prisma.user.deleteMany({ where: { id: createdUserId } });
    }
    if (branchId) {
      await prisma.userBranch.deleteMany({ where: { branchId } });
      await prisma.branch.deleteMany({ where: { id: branchId } });
    }
  });

  it("creates a user, lists it, updates it, assigns a branch, and disables it", async () => {
    const create = await request(app).post("/api/users").set("Cookie", [cookie]).send({
      firstName: "Nueva", lastName: "Vendedora", displayName: "Nueva Vendedora",
      username: "nueva_vendedora", email: "nueva@bellamakeup.demo", password: "Password#123", roleId: cashierRoleId,
    });
    expect(create.status).toBe(201);
    expect(create.body.passwordHash).toBeUndefined();
    const id = create.body.id;
    createdUserId = id;

    const list = await request(app).get("/api/users").set("Cookie", [cookie]);
    expect(list.body.some((u: any) => u.id === id)).toBe(true);

    const assign = await request(app).put(`/api/users/${id}/branches`).set("Cookie", [cookie]).send({ branchIds: [branchId], allBranches: false });
    expect(assign.body.branches.map((b: any) => b.id)).toContain(branchId);

    const disable = await request(app).patch(`/api/users/${id}/status`).set("Cookie", [cookie]).send({ status: "DISABLED" });
    expect(disable.body.status).toBe("DISABLED");
    // Regression: updateUserStatus must re-fetch the full user (with userBranches)
    // before building the DTO, not just use the bare updateUser() result — otherwise
    // this response would report branches: [] even though the branch assignment above
    // was never touched.
    expect(disable.body.branches.map((b: any) => b.id)).toContain(branchId);
  });

  it("returns 409 (not a raw 500) when creating a user with a duplicate username", async () => {
    // Regression for the centralized Prisma error mapping: a unique-constraint
    // violation on user creation must map to 409, not fall through to a 500.
    const res = await request(app).post("/api/users").set("Cookie", [cookie]).send({
      firstName: "Otra", lastName: "Vendedora", displayName: "Otra Vendedora",
      username: "nueva_vendedora", email: "otra@bellamakeup.demo", password: "Password#123", roleId: cashierRoleId,
    });
    expect(res.status).toBe(409);
    expect(typeof res.body.message).toBe("string");
  });

  it("returns 404 (not a raw 500) when updating a nonexistent user", async () => {
    // Regression for the centralized Prisma error mapping: P2025 (record not
    // found) must map to 404, not fall through to a 500.
    const res = await request(app)
      .put("/api/users/00000000-0000-0000-0000-000000000099")
      .set("Cookie", [cookie])
      .send({ displayName: "No existe" });
    expect(res.status).toBe(404);
  });

  it("refuses to let an admin change their own role (self-demotion protection)", async () => {
    const res = await request(app)
      .put(`/api/users/${selfAdminId}`)
      .set("Cookie", [cookie])
      .send({ roleId: cashierRoleId });
    expect(res.status).toBe(400);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: selfAdminId } });
    expect(after.roleId).toBe(adminRoleId);
  });

  it("refuses to let an admin change another admin's role", async () => {
    const res = await request(app)
      .put(`/api/users/${otherAdminId}`)
      .set("Cookie", [cookie])
      .send({ roleId: cashierRoleId });
    expect(res.status).toBe(400);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: otherAdminId } });
    expect(after.roleId).toBe(adminRoleId);
  });

  it("still allows non-role edits to an admin account", async () => {
    const res = await request(app)
      .put(`/api/users/${otherAdminId}`)
      .set("Cookie", [cookie])
      .send({ phone: "555-000-1111" });
    expect(res.status).toBe(200);
    expect(res.body.phone).toBe("555-000-1111");
  });

  it("allows changing a non-admin user's role normally", async () => {
    // Sanity check: the admin-role guard must not accidentally block role
    // changes for everyone — only accounts that are CURRENTLY admin.
    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { code: "viewer" } });
    const res = await request(app)
      .put(`/api/users/${createdUserId}`)
      .set("Cookie", [cookie])
      .send({ roleId: viewerRole.id });
    expect(res.status).toBe(200);
    expect(res.body.role.code).toBe("viewer");
  });
});
