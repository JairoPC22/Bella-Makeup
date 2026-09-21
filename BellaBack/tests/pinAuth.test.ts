import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword, comparePassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

// The supervisor-PIN co-sign primitive (Part 1).
//
// Rate-limit note that shapes this whole file: POST /api/auth/verify-pin is
// limited to 5 FAILED attempts per 15 minutes keyed on the ACTING user's id
// (successes are skipped). Each describe block therefore uses its own acting
// "cashier" user so one block's deliberate failures can never exhaust
// another's budget and cause a misleading 429. The counts are kept under 5
// per actor on purpose — except in the rate-limit block, which exists to
// cross that line.
describe("Supervisor PIN authorization", () => {
  const PASSWORD = "Password#123";

  const SUPERVISOR_A_PIN = "4321"; // branch A only, has purchases.authorize
  const SUPERVISOR_B_PIN = "5678"; // branch B only, has purchases.authorize
  const GLOBAL_SUPERVISOR_PIN = "9012"; // allBranches, has purchases.authorize
  const CASHIER_PIN = "1357"; // valid PIN, but cashier role lacks purchases.authorize

  let branchA: { id: string };
  let branchB: { id: string };

  let supervisorA: { id: string };
  let supervisorB: { id: string };
  let globalSupervisor: { id: string };

  let pinOwnerCookie: string; // used for the "set my own PIN" block
  let pinOwnerId: string;

  let actorSuccessCookie: string;
  let actorPermCookie: string;
  let actorScopeCookie: string;
  let actorRateCookie: string;
  let actorLeakCookie: string;

  const testUsernames = [
    "pin_test_supervisor_a",
    "pin_test_supervisor_b",
    "pin_test_supervisor_global",
    "pin_test_cashier_with_pin",
    "pin_test_owner",
    "pin_test_actor_success",
    "pin_test_actor_perm",
    "pin_test_actor_scope",
    "pin_test_actor_rate",
    "pin_test_actor_leak",
  ];

  // Creates a user with the given role, optional branch assignment and
  // optional pre-hashed PIN, and returns it plus a ready-to-use auth cookie.
  async function makeUser(opts: {
    username: string;
    roleId: string;
    allBranches?: boolean;
    branchId?: string;
    pin?: string;
  }) {
    const user = await prisma.user.upsert({
      where: { username: opts.username },
      update: {},
      create: {
        firstName: "Pin",
        lastName: opts.username,
        displayName: `Pin ${opts.username}`,
        username: opts.username,
        email: `${opts.username}@bellamakeup.demo`,
        passwordHash: await hashPassword(PASSWORD),
        avatarSeed: "seed",
        roleId: opts.roleId,
        allBranches: opts.allBranches ?? false,
        // Hashed with the exact same bcrypt utility as passwordHash — there
        // is deliberately no second hashing library in this codebase.
        pinHash: opts.pin ? await hashPassword(opts.pin) : null,
      },
    });
    if (opts.branchId) {
      await prisma.userBranch.upsert({
        where: { userId_branchId: { userId: user.id, branchId: opts.branchId } },
        update: {},
        create: { userId: user.id, branchId: opts.branchId },
      });
    }
    return { user, cookie: `access_token=${signAccessToken({ sub: user.id, roleId: opts.roleId })}` };
  }

  beforeAll(async () => {
    // branch_manager is seeded with purchases.authorize; cashier is not.
    const managerRole = await prisma.role.findUniqueOrThrow({ where: { code: "branch_manager" } });
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });

    branchA = await prisma.branch.create({ data: { name: `Pin Sucursal A ${Date.now()}` } });
    branchB = await prisma.branch.create({ data: { name: `Pin Sucursal B ${Date.now()}` } });

    supervisorA = (
      await makeUser({ username: "pin_test_supervisor_a", roleId: managerRole.id, branchId: branchA.id, pin: SUPERVISOR_A_PIN })
    ).user;
    supervisorB = (
      await makeUser({ username: "pin_test_supervisor_b", roleId: managerRole.id, branchId: branchB.id, pin: SUPERVISOR_B_PIN })
    ).user;
    globalSupervisor = (
      await makeUser({
        username: "pin_test_supervisor_global",
        roleId: managerRole.id,
        allBranches: true,
        pin: GLOBAL_SUPERVISOR_PIN,
      })
    ).user;

    // A cashier who HAS set a PIN — proves the permission filter, not the
    // mere presence of a PIN, is what gates authorization.
    await makeUser({ username: "pin_test_cashier_with_pin", roleId: cashierRole.id, branchId: branchA.id, pin: CASHIER_PIN });

    const owner = await makeUser({ username: "pin_test_owner", roleId: managerRole.id, branchId: branchA.id });
    pinOwnerCookie = owner.cookie;
    pinOwnerId = owner.user.id;

    // One acting cashier per block — see the rate-limit note at the top.
    actorSuccessCookie = (await makeUser({ username: "pin_test_actor_success", roleId: cashierRole.id, branchId: branchA.id })).cookie;
    actorPermCookie = (await makeUser({ username: "pin_test_actor_perm", roleId: cashierRole.id, branchId: branchA.id })).cookie;
    actorScopeCookie = (await makeUser({ username: "pin_test_actor_scope", roleId: cashierRole.id, branchId: branchA.id })).cookie;
    actorRateCookie = (await makeUser({ username: "pin_test_actor_rate", roleId: cashierRole.id, branchId: branchA.id })).cookie;
    actorLeakCookie = (await makeUser({ username: "pin_test_actor_leak", roleId: cashierRole.id, branchId: branchA.id })).cookie;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { username: { in: testUsernames } } });
    await prisma.branch.deleteMany({ where: { id: { in: [branchA.id, branchB.id] } } }).catch(() => {});
  });

  describe("PUT /api/users/me/pin — setting your own PIN", () => {
    it("rejects a wrong current password with 400 and does not set a PIN", async () => {
      const res = await request(app)
        .put("/api/users/me/pin")
        .set("Cookie", [pinOwnerCookie])
        .send({ pin: "2468", currentPassword: "NotMyPassword#1" });

      expect(res.status).toBe(400);
      const user = await prisma.user.findUniqueOrThrow({ where: { id: pinOwnerId } });
      expect(user.pinHash).toBeNull();
    });

    it("rejects PINs that are not 4-6 digits", async () => {
      const invalid = ["abc", "12a4", "123", "1234567", "", "12 34", "１２３４"];
      for (const pin of invalid) {
        const res = await request(app)
          .put("/api/users/me/pin")
          .set("Cookie", [pinOwnerCookie])
          .send({ pin, currentPassword: PASSWORD });
        expect(res.status, `PIN "${pin}" should have been rejected`).toBe(400);
      }
      const user = await prisma.user.findUniqueOrThrow({ where: { id: pinOwnerId } });
      expect(user.pinHash).toBeNull();
    });

    it("accepts 4, 5 and 6 digit PINs and stores them hashed, never in plaintext", async () => {
      for (const pin of ["1234", "12345", "123456"]) {
        const res = await request(app)
          .put("/api/users/me/pin")
          .set("Cookie", [pinOwnerCookie])
          .send({ pin, currentPassword: PASSWORD });

        expect(res.status, `PIN "${pin}" should have been accepted`).toBe(200);
        expect(res.body).toEqual({ ok: true });

        const user = await prisma.user.findUniqueOrThrow({ where: { id: pinOwnerId } });
        expect(user.pinHash).toBeTruthy();
        // Stored as a bcrypt hash, not the digits themselves.
        expect(user.pinHash).not.toBe(pin);
        expect(user.pinHash).toMatch(/^\$2[aby]\$/);
        expect(await comparePassword(pin, user.pinHash!)).toBe(true);
      }
    });

    it("requires authentication", async () => {
      const res = await request(app).put("/api/users/me/pin").send({ pin: "1234", currentPassword: PASSWORD });
      expect(res.status).toBe(401);
    });

    it("exposes no admin-sets-someone-else's-PIN route", async () => {
      // A PIN a third party can set is no longer evidence that a specific
      // person was present, so this route must simply not exist.
      const res = await request(app)
        .put(`/api/users/${supervisorA.id}/pin`)
        .set("Cookie", [pinOwnerCookie])
        .send({ pin: "1234", currentPassword: PASSWORD });
      expect(res.status).toBe(404);
    });

    it("never returns pinHash from any user-facing endpoint", async () => {
      const me = await request(app).get("/api/auth/me").set("Cookie", [pinOwnerCookie]);
      expect(me.status).toBe(200);
      expect(me.body.user).not.toHaveProperty("pinHash");
      expect(me.body.user).not.toHaveProperty("passwordHash");
      // ...but the frontend still needs to know a PIN exists.
      expect(me.body.user.hasPin).toBe(true);

      const profile = await request(app).get("/api/profile").set("Cookie", [pinOwnerCookie]);
      expect(profile.status).toBe(200);
      expect(profile.body).not.toHaveProperty("pinHash");

      expect(JSON.stringify(me.body)).not.toContain("pinHash");
    });
  });

  describe("POST /api/auth/verify-pin — success path", () => {
    it("authorizes a supervisor with the right permission at the acting cashier's branch", async () => {
      const res = await request(app)
        .post("/api/auth/verify-pin")
        .set("Cookie", [actorSuccessCookie])
        .send({ pin: SUPERVISOR_A_PIN, requiredPermission: "purchases.authorize" });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      // Attributed to the specific person, so the calling module can record
      // who approved the action in its own audit trail.
      expect(res.body.supervisorId).toBe(supervisorA.id);
      expect(res.body.supervisorName).toBe("Pin pin_test_supervisor_a");
      // The response must never echo the candidate set or any hash.
      expect(res.body).not.toHaveProperty("pinHash");
      expect(Object.keys(res.body).sort()).toEqual(["ok", "supervisorId", "supervisorName"]);
    });

    it("authorizes an allBranches supervisor even though they have no explicit assignment to this branch", async () => {
      const res = await request(app)
        .post("/api/auth/verify-pin")
        .set("Cookie", [actorSuccessCookie])
        .send({ pin: GLOBAL_SUPERVISOR_PIN, requiredPermission: "purchases.authorize" });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.supervisorId).toBe(globalSupervisor.id);
    });

    it("records the authorizing supervisor in the audit log", async () => {
      await request(app)
        .post("/api/auth/verify-pin")
        .set("Cookie", [actorSuccessCookie])
        .send({ pin: SUPERVISOR_A_PIN, requiredPermission: "purchases.authorize" });

      const entry = await prisma.auditLog.findFirst({
        where: { action: "auth.verify_pin", entityId: supervisorA.id },
        orderBy: { createdAt: "desc" },
      });
      expect(entry).toBeTruthy();
      expect((entry!.details as any).supervisorId).toBe(supervisorA.id);
    });

    it("requires authentication", async () => {
      const res = await request(app)
        .post("/api/auth/verify-pin")
        .send({ pin: SUPERVISOR_A_PIN, requiredPermission: "purchases.authorize" });
      expect(res.status).toBe(401);
      // 401 from requireAuth, not from the PIN check.
      expect(res.body).not.toHaveProperty("ok");
    });
  });

  describe("POST /api/auth/verify-pin — permission scoping", () => {
    it("rejects a valid PIN whose owner lacks the required permission", async () => {
      // CASHIER_PIN is a real, correctly-formatted PIN belonging to a real,
      // active user at the acting cashier's own branch. The ONLY reason it
      // fails is that the cashier role does not hold purchases.authorize.
      const res = await request(app)
        .post("/api/auth/verify-pin")
        .set("Cookie", [actorPermCookie])
        .send({ pin: CASHIER_PIN, requiredPermission: "purchases.authorize" });

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe("PIN inválido o sin autorización para esta acción.");
    });

    it("rejects when the required permission exists but nobody holding it has a PIN", async () => {
      const res = await request(app)
        .post("/api/auth/verify-pin")
        .set("Cookie", [actorPermCookie])
        .send({ pin: SUPERVISOR_A_PIN, requiredPermission: "roles.manage" });

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });
  });

  describe("POST /api/auth/verify-pin — branch scoping", () => {
    it("rejects a supervisor PIN from a different branch", async () => {
      // supervisorB holds purchases.authorize and has a valid PIN, but is
      // assigned only to branch B while the acting cashier is at branch A.
      const res = await request(app)
        .post("/api/auth/verify-pin")
        .set("Cookie", [actorScopeCookie])
        .send({ pin: SUPERVISOR_B_PIN, requiredPermission: "purchases.authorize" });

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it("accepts a same-branch supervisor for that same acting cashier", async () => {
      // Same actor, same permission, same request shape — only the branch
      // relationship differs from the previous case.
      const res = await request(app)
        .post("/api/auth/verify-pin")
        .set("Cookie", [actorScopeCookie])
        .send({ pin: SUPERVISOR_A_PIN, requiredPermission: "purchases.authorize" });

      expect(res.status).toBe(200);
      expect(res.body.supervisorId).toBe(supervisorA.id);
    });

    it("rejects a PIN belonging to a DISABLED supervisor", async () => {
      await prisma.user.update({ where: { id: supervisorA.id }, data: { status: "DISABLED" } });
      try {
        const res = await request(app)
          .post("/api/auth/verify-pin")
          .set("Cookie", [actorScopeCookie])
          .send({ pin: SUPERVISOR_A_PIN, requiredPermission: "purchases.authorize" });
        expect(res.status).toBe(401);
        expect(res.body.ok).toBe(false);
      } finally {
        await prisma.user.update({ where: { id: supervisorA.id }, data: { status: "ACTIVE" } });
      }
    });
  });

  describe("POST /api/auth/verify-pin — failures leak nothing", () => {
    it("returns a byte-identical body for every distinct failure cause", async () => {
      const send = (body: Record<string, unknown>) =>
        request(app).post("/api/auth/verify-pin").set("Cookie", [actorLeakCookie]).send(body);

      // Four genuinely different causes:
      const malformed = await send({ pin: "abc", requiredPermission: "purchases.authorize" });
      const wrongDigits = await send({ pin: "0000", requiredPermission: "purchases.authorize" });
      const noPermission = await send({ pin: CASHIER_PIN, requiredPermission: "purchases.authorize" });
      const wrongBranch = await send({ pin: SUPERVISOR_B_PIN, requiredPermission: "purchases.authorize" });

      const responses = [malformed, wrongDigits, noPermission, wrongBranch];
      for (const res of responses) {
        expect(res.status).toBe(401);
      }
      // Identical status AND identical body — an attacker learns nothing
      // about WHY, so they cannot probe who holds authority.
      const bodies = responses.map((r) => JSON.stringify(r.body));
      expect(new Set(bodies).size).toBe(1);
      expect(JSON.parse(bodies[0])).toEqual({
        ok: false,
        error: "PIN inválido o sin autorización para esta acción.",
      });

      // In particular, nothing names a candidate.
      for (const res of responses) {
        const body = JSON.stringify(res.body);
        expect(body).not.toContain(supervisorA.id);
        expect(body).not.toContain(supervisorB.id);
        expect(body).not.toContain("pin_test");
      }
    });

    it("does not record which candidates were checked on a failed attempt", async () => {
      const entry = await prisma.auditLog.findFirst({
        where: { action: "auth.verify_pin_failed" },
        orderBy: { createdAt: "desc" },
      });
      expect(entry).toBeTruthy();
      const details = JSON.stringify(entry!.details ?? {});
      expect(details).not.toContain(supervisorA.id);
      expect(details).not.toContain(supervisorB.id);
      // The attempted PIN itself must never be persisted either.
      expect(details).not.toContain(SUPERVISOR_B_PIN);
      expect(details).not.toContain(CASHIER_PIN);
    });
  });

  describe("POST /api/auth/verify-pin — rate limiting", () => {
    it("blocks with 429 after 5 failed attempts by the same acting user", async () => {
      const attempt = () =>
        request(app)
          .post("/api/auth/verify-pin")
          .set("Cookie", [actorRateCookie])
          .send({ pin: "0000", requiredPermission: "purchases.authorize" });

      for (let i = 1; i <= 5; i++) {
        const res = await attempt();
        expect(res.status, `attempt ${i} should still be allowed through`).toBe(401);
      }

      const blocked = await attempt();
      expect(blocked.status).toBe(429);
      expect(blocked.body.ok).toBe(false);
      // Still a JSON envelope the calling module can parse, not
      // express-rate-limit's default plain-text body.
      expect(typeof blocked.body.error).toBe("string");
    });

    it("throttles per acting user, not globally — a different cashier is unaffected", async () => {
      // actorRateCookie is now exhausted; a different cashier's session must
      // still work, otherwise one brute-forcing terminal would take the whole
      // store offline.
      const res = await request(app)
        .post("/api/auth/verify-pin")
        .set("Cookie", [actorSuccessCookie])
        .send({ pin: SUPERVISOR_A_PIN, requiredPermission: "purchases.authorize" });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
