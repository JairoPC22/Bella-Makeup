// tests/companySettings.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

describe("Company settings", () => {
  let cookie: string;

  beforeAll(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "admin" } });
    const user = await prisma.user.upsert({
      where: { username: "settings_test_admin" },
      update: {},
      create: {
        firstName: "Settings", lastName: "Admin", displayName: "Settings Admin",
        username: "settings_test_admin", email: "settings_test_admin@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: adminRole.id, allBranches: true,
      },
    });
    cookie = `access_token=${signAccessToken({ sub: user.id, roleId: adminRole.id })}`;
  });

  it("gets and updates company settings", async () => {
    const get = await request(app).get("/api/company-settings").set("Cookie", [cookie]);
    expect(get.status).toBe(200);
    expect(get.body.companyName).toBe("Bella Makeup");

    const update = await request(app).put("/api/company-settings").set("Cookie", [cookie]).send({ phone: "555-999-0000" });
    expect(update.body.phone).toBe("555-999-0000");
  });
});
