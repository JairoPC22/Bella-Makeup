import { z } from "zod";

// Zod's built-in `.uuid()` only accepts RFC 4122 version 1-8 / variant 8-b
// UUIDs (plus the special all-zero/all-f forms). The seeded demo branches
// (prisma/seed.ts) use deterministic ids like
// "00000000-0000-0000-0000-000000000001" for readability/reproducibility in
// fixtures, which are valid UUID-shaped strings but fail that stricter
// check (their version/variant nibbles are both "0"). That made
// PUT /api/users/:id/branches reject any attempt to assign a user to one of
// the two seeded branches with a 400 "Datos inválidos" — a real bug, not a
// theoretical one, since assigning a user to a specific (non-"todas")
// branch is a core Phase 1 flow. Validate UUID *shape* only; Prisma still
// rejects ids that don't correspond to a real row.
const uuidShape = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, "Invalid UUID");

export const createUserSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  displayName: z.string().min(1),
  username: z.string().min(3),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8),
  roleId: z.string().uuid(),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  roleId: z.string().uuid().optional(),
});

export const updateUserStatusSchema = z.object({ status: z.enum(["ACTIVE", "DISABLED"]) });

export const assignBranchesSchema = z.object({
  branchIds: z.array(uuidShape),
  allBranches: z.boolean(),
});
