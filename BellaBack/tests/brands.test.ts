import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

describe("Brands CRUD", () => {
  let cookie: string;

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const user = await prisma.user.upsert({
      where: { username: "brands_test_admin" },
      update: {},
      create: {
        firstName: "Brands", lastName: "Admin", displayName: "Brands Admin",
        username: "brands_test_admin", email: "brands_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    cookie = `access_token=${signAccessToken({ sub: user.id, roleId: adminRole.id })}`;
  });

  it("creates, lists, updates and deactivates a brand", async () => {
    const create = await request(app).post("/api/brands").set("Cookie", [cookie]).send({ name: "Marca Test" });
    expect(create.status).toBe(201);
    const id = create.body.id;

    const list = await request(app).get("/api/brands").set("Cookie", [cookie]);
    expect(list.body.some((b: any) => b.id === id)).toBe(true);

    const update = await request(app).put(`/api/brands/${id}`).set("Cookie", [cookie]).send({ name: "Marca Test Editada" });
    expect(update.body.name).toBe("Marca Test Editada");

    const deactivate = await request(app).patch(`/api/brands/${id}/status`).set("Cookie", [cookie]).send({ status: "INACTIVE" });
    expect(deactivate.body.status).toBe("INACTIVE");
  });

  it("rejects creation without products.edit permission", async () => {
    const viewerRole = await prisma.role.findUniqueOrThrow({ where: { code: "viewer" } });
    const viewer = await prisma.user.upsert({
      where: { username: "brands_test_viewer" },
      update: {},
      create: {
        firstName: "V", lastName: "T", displayName: "V T", username: "brands_test_viewer",
        email: "brands_test_viewer@bellamakeup.demo", passwordHash: await hashPassword("Password#123"),
        avatarSeed: "seed", roleId: viewerRole.id, allBranches: true,
      },
    });
    const viewerCookie = `access_token=${signAccessToken({ sub: viewer.id, roleId: viewerRole.id })}`;
    const res = await request(app).post("/api/brands").set("Cookie", [viewerCookie]).send({ name: "Should Fail" });
    expect(res.status).toBe(403);
  });
});
