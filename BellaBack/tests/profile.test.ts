import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

describe("Profile endpoints", () => {
  let cookie: string;

  beforeAll(async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    // The test below changes the password and the avatar seed, so a second run of this
    // file must not rely on state left over from a previous run: reset the mutable
    // fields (passwordHash, avatarSeed, avatarStyle, displayName) on `update` as well as
    // `create`, so every run starts from the same known baseline.
    const user = await prisma.user.upsert({
      where: { username: "profile_test_user" },
      update: {
        passwordHash: await hashPassword("Password#123"),
        avatarSeed: "original-seed",
        avatarStyle: "adventurer",
        displayName: "Profile Test",
      },
      create: {
        firstName: "Profile", lastName: "Test", displayName: "Profile Test",
        username: "profile_test_user", email: "profile_test_user@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "original-seed", roleId: role.id,
      },
    });
    cookie = `access_token=${signAccessToken({ sub: user.id, roleId: role.id })}`;
  });

  it("gets and updates the profile, changes password, and changes avatar", async () => {
    const get = await request(app).get("/api/profile").set("Cookie", [cookie]);
    expect(get.status).toBe(200);
    expect(get.body.passwordHash).toBeUndefined();

    const update = await request(app).put("/api/profile").set("Cookie", [cookie]).send({ displayName: "Nuevo Nombre" });
    expect(update.body.displayName).toBe("Nuevo Nombre");

    const options = await request(app).get("/api/profile/avatar-options?count=4").set("Cookie", [cookie]);
    expect(options.body.length).toBe(4);
    const chosenSeed = options.body[0].seed;

    const avatarUpdate = await request(app).put("/api/profile/avatar").set("Cookie", [cookie]).send({ seed: chosenSeed });
    expect(avatarUpdate.body.avatarSeed).toBe(chosenSeed);

    const passwordUpdate = await request(app).put("/api/profile/password").set("Cookie", [cookie]).send({ currentPassword: "Password#123", newPassword: "NewPassword#456" });
    expect(passwordUpdate.status).toBe(200);
  });

  it("rejects a password change with an incorrect current password", async () => {
    const res = await request(app).put("/api/profile/password").set("Cookie", [cookie]).send({ currentPassword: "wrong", newPassword: "NewPassword#456" });
    expect(res.status).toBe(400);
  });
});
