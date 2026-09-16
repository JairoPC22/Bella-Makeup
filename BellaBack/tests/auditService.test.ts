import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../src/config/prisma";
import { logAudit, listAudit } from "../src/services/auditService";

describe("auditService", () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
  });

  it("logs an audit entry and lists it back", async () => {
    await logAudit({ userId: null, action: "test.action", module: "test", details: { foo: "bar" } });
    const { items, total } = await listAudit({});
    expect(total).toBe(1);
    expect(items[0].action).toBe("test.action");
    expect(items[0].module).toBe("test");
  });

  it("filters by module", async () => {
    await logAudit({ userId: null, action: "a", module: "users" });
    await logAudit({ userId: null, action: "b", module: "branches" });
    const { items, total } = await listAudit({ module: "users" });
    expect(total).toBe(1);
    expect(items[0].module).toBe("users");
  });
});
