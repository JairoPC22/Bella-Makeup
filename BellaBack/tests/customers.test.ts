import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { prisma } from "../src/config/prisma";
import { hashPassword } from "../src/utils/password";
import { signAccessToken } from "../src/utils/jwt";

describe("Customers (POS quick-create + search)", () => {
  let cashierCookie: string;
  let noPermCookie: string;
  const customerIds: string[] = [];
  const suffix = Date.now();

  beforeAll(async () => {
    const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "cashier" } });
    const cashier = await prisma.user.upsert({
      where: { username: "customers_test_cashier" },
      update: {},
      create: {
        firstName: "Customers", lastName: "Cashier", displayName: "Customers Cashier",
        username: "customers_test_cashier", email: "customers_test_cashier@bellamakeup.demo",
        passwordHash: await hashPassword("Password#123"), avatarSeed: "seed", roleId: cashierRole.id, allBranches: true,
      },
    });
    cashierCookie = `access_token=${signAccessToken({ sub: cashier.id, roleId: cashierRole.id })}`;

    // No seeded role lacks sales.view/sales.create entirely, so a bespoke
    // permission-less role is created here to exercise the 403 path —
    // mirrors tests/inventory.test.ts's own "no perms" role.
    const noPermRole = await prisma.role.upsert({
      where: { code: "customers_test_no_perms" },
      update: {},
      create: { code: "customers_test_no_perms", name: "Sin permisos (test)", description: "Rol de prueba sin permisos" },
    });
    const noPermUser = await prisma.user.upsert({
      where: { username: "customers_test_noperm" },
      update: {},
      create: {
        firstName: "No", lastName: "Perm", displayName: "No Perm", username: "customers_test_noperm",
        email: "customers_test_noperm@bellamakeup.demo", passwordHash: await hashPassword("Password#123"),
        avatarSeed: "seed", roleId: noPermRole.id, allBranches: true,
      },
    });
    noPermCookie = `access_token=${signAccessToken({ sub: noPermUser.id, roleId: noPermRole.id })}`;
  });

  afterAll(async () => {
    await prisma.customer.deleteMany({ where: { id: { in: customerIds } } });
    await prisma.user.deleteMany({ where: { username: { in: ["customers_test_cashier", "customers_test_noperm"] } } });
    await prisma.role.deleteMany({ where: { code: "customers_test_no_perms" } }).catch(() => {});
  });

  it("requires authentication", async () => {
    const res = await request(app).get("/api/customers");
    expect(res.status).toBe(401);
  });

  it("rejects a user whose role lacks sales.view/sales.create with 403 on both endpoints", async () => {
    const getRes = await request(app).get("/api/customers").set("Cookie", [noPermCookie]);
    expect(getRes.status).toBe(403);

    const postRes = await request(app)
      .post("/api/customers")
      .set("Cookie", [noPermCookie])
      .send({ firstName: "Nadie" });
    expect(postRes.status).toBe(403);
  });

  it("quick-creates a customer from the POS with just a name and phone", async () => {
    const phone = `555-QUICK-${suffix}`;
    const res = await request(app)
      .post("/api/customers")
      .set("Cookie", [cashierCookie])
      .send({ firstName: "Juana", lastName: "Pérez", phone });

    expect(res.status).toBe(201);
    expect(res.body.firstName).toBe("Juana");
    expect(res.body.phone).toBe(phone);
    customerIds.push(res.body.id);

    // Round trip: search by a substring of the phone number finds it,
    // case-insensitive name search too.
    const searchByPhone = await request(app)
      .get(`/api/customers?search=${encodeURIComponent(phone.slice(-6))}`)
      .set("Cookie", [cashierCookie]);
    expect(searchByPhone.status).toBe(200);
    expect(searchByPhone.body.some((c: any) => c.id === res.body.id)).toBe(true);

    const searchByName = await request(app)
      .get("/api/customers?search=juana")
      .set("Cookie", [cashierCookie]);
    expect(searchByName.status).toBe(200);
    expect(searchByName.body.some((c: any) => c.id === res.body.id)).toBe(true);
  });

  it("rejects a fully-blank customer (no firstName, no phone) with 400", async () => {
    const res = await request(app)
      .post("/api/customers")
      .set("Cookie", [cashierCookie])
      .send({ email: "sinnombre@example.com" });
    expect(res.status).toBe(400);
  });

  it("accepts a phone-only customer (no firstName required, since at least one of the two is enough)", async () => {
    const phone = `555-PHONEONLY-${suffix}`;
    const res = await request(app)
      .post("/api/customers")
      .set("Cookie", [cashierCookie])
      .send({ phone });
    expect(res.status).toBe(201);
    customerIds.push(res.body.id);
  });
});
