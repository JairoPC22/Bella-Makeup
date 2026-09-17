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

describe("Password change revokes refresh tokens", () => {
  function extractCookie(setCookie: string[] | undefined, name: string): string | undefined {
    const raw = setCookie?.find((c) => c.startsWith(`${name}=`));
    return raw?.split(";")[0];
  }

  it("invalidates a refresh token issued before the password change", async () => {
    const role = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    await prisma.user.upsert({
      where: { username: "profile_test_user_revoke" },
      update: { passwordHash: await hashPassword("Password#123") },
      create: {
        firstName: "Revoke", lastName: "Test", displayName: "Revoke Test",
        username: "profile_test_user_revoke", email: "profile_test_user_revoke@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "revoke-seed", roleId: role.id,
      },
    });

    const login = await request(app).post("/api/auth/login").send({ username: "profile_test_user_revoke", password: "Password#123" });
    expect(login.status).toBe(200);
    const refreshCookie = extractCookie(login.headers["set-cookie"], "refresh_token");
    const accessCookie = extractCookie(login.headers["set-cookie"], "access_token");
    expect(refreshCookie).toBeDefined();
    expect(accessCookie).toBeDefined();

    const changePassword = await request(app)
      .put("/api/profile/password")
      .set("Cookie", [accessCookie!])
      .send({ currentPassword: "Password#123", newPassword: "NewPassword#789" });
    expect(changePassword.status).toBe(200);

    // The refresh token issued before the password change must no longer work.
    const refreshAfter = await request(app).post("/api/auth/refresh").set("Cookie", [refreshCookie!]);
    expect(refreshAfter.status).toBe(401);
  });
});
