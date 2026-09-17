import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../src/config/prisma";
import { logAudit, listAudit } from "../src/services/auditService";

describe("auditService", () => {
  // Use a unique test-file identifier so that parallel test runs don't interfere.
  // Each test creates audit entries with these distinctive module names.
  const TEST_MODULE_1 = "auditService.test.logs-and-lists";
  const TEST_MODULE_2 = "auditService.test.filters-by-module";
  const TEST_MODULES = [TEST_MODULE_1, TEST_MODULE_2];

  afterAll(async () => {
    // Clean up only the rows this test file created, not the entire audit_logs table.
    // Other tests (auth.test.ts, smoke.test.ts, etc.) may be writing to the same DB
    // concurrently, so we scope cleanup to just our distinctive module names.
    // Guarded: only delete if we actually created something (all TEST_MODULES are defined).
    if (TEST_MODULES.length > 0) {
      await prisma.auditLog.deleteMany({ where: { module: { in: TEST_MODULES } } });
    }
  });

  it("logs an audit entry and lists it back", async () => {
    await logAudit({ userId: null, action: "test.action", module: TEST_MODULE_1, details: { foo: "bar" } });
    // Query only rows this test created, not the whole table (which may have rows from other concurrent tests).
    const { items, total } = await listAudit({ module: TEST_MODULE_1 });
    expect(total).toBe(1);
    expect(items[0].action).toBe("test.action");
    expect(items[0].module).toBe(TEST_MODULE_1);
  });

  it("filters by module", async () => {
    // Use distinctive module names so this test's assertions only see its own rows,
    // even if other tests are concurrently writing to audit_logs.
    const testUsers = "auditService.test.filter-users";
    const testBranches = "auditService.test.filter-branches";

    await logAudit({ userId: null, action: "a", module: testUsers });
    await logAudit({ userId: null, action: "b", module: testBranches });

    // Assert only against the filtered results for this test's module.
    const { items, total } = await listAudit({ module: testUsers });
    expect(total).toBe(1);
    expect(items[0].module).toBe(testUsers);

    // Clean up the extra modules this test created beyond TEST_MODULES (for tidiness).
    await prisma.auditLog.deleteMany({ where: { module: { in: [testUsers, testBranches] } } });
  });
});
