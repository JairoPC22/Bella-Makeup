import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

describe("Branches CRUD", () => {
  let cookie: string;

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const user = await prisma.user.upsert({
      where: { username: "branches_test_admin" },
      update: {},
      create: {
        firstName: "Branches", lastName: "Admin", displayName: "Branches Admin",
        username: "branches_test_admin", email: "branches_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    cookie = `access_token=${signAccessToken({ sub: user.id, roleId: adminRole.id })}`;
  });

  it("creates, lists, updates and deactivates a branch", async () => {
    const create = await request(app).post("/api/branches").set("Cookie", [cookie]).send({ name: "Sucursal Test" });
    expect(create.status).toBe(201);
    const id = create.body.id;

    const list = await request(app).get("/api/branches").set("Cookie", [cookie]);
    expect(list.body.some((b: any) => b.id === id)).toBe(true);

    const update = await request(app).put(`/api/branches/${id}`).set("Cookie", [cookie]).send({ name: "Sucursal Test Editada" });
    expect(update.body.name).toBe("Sucursal Test Editada");

    const deactivate = await request(app).patch(`/api/branches/${id}/status`).set("Cookie", [cookie]).send({ status: "INACTIVE" });
    expect(deactivate.body.status).toBe("INACTIVE");
  });

  it("rejects creation without branches.manage permission", async () => {
    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { code: "viewer" } });
    const viewer = await prisma.user.upsert({
      where: { username: "branches_test_viewer" },
      update: {},
      create: {
        firstName: "V", lastName: "T", displayName: "V T", username: "branches_test_viewer",
        email: "branches_test_viewer@bellamakeup.demo", passwordHash: await hashPassword("Password#123"),
        avatarSeed: "seed", roleId: viewerRole.id, allBranches: true,
      },
    });
    const viewerCookie = `access_token=${signAccessToken({ sub: viewer.id, roleId: viewerRole.id })}`;
    const res = await request(app).post("/api/branches").set("Cookie", [viewerCookie]).send({ name: "Should Fail" });
    expect(res.status).toBe(403);
  });

  describe("GET /branches/revenue", () => {
    it("returns per-branch revenue totals for an admin", async () => {
      const res = await request(app).get("/api/branches/revenue").set("Cookie", [cookie]);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.rows)).toBe(true);
      expect(typeof res.body.grandTotal).toBe("number");
      if (res.body.rows.length > 0) {
        expect(res.body.rows[0]).toHaveProperty("branchId");
        expect(res.body.rows[0]).toHaveProperty("branchName");
        expect(res.body.rows[0]).toHaveProperty("revenue");
        expect(res.body.rows[0]).toHaveProperty("saleCount");
      }
    });

    it("is denied to a role with branches.view but no branches.manage (e.g. branch manager)", async () => {
      // The client explicitly asked that branch earnings be admin-only —
      // branch_manager is the seeded role that has branches.view (can see
      // the branches list) but NOT branches.manage, which is exactly the
      // boundary this endpoint must enforce.
      const managerRole = await prisma.role.findUniqueOrThrow({ where: { code: "branch_manager" } });
      const manager = await prisma.user.upsert({
        where: { username: "branches_test_manager" },
        update: {},
        create: {
          firstName: "M", lastName: "T", displayName: "M T", username: "branches_test_manager",
          email: "branches_test_manager@bellamakeup.demo", passwordHash: await hashPassword("Password#123"),
          avatarSeed: "seed", roleId: managerRole.id, allBranches: true,
        },
      });
      const managerCookie = `access_token=${signAccessToken({ sub: manager.id, roleId: managerRole.id })}`;
      const res = await request(app).get("/api/branches/revenue").set("Cookie", [managerCookie]);
      expect(res.status).toBe(403);
    });
  });
});
