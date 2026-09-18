import { z } from "zod";

// Actual permission-code validity (does the code exist in the Permission
// table?) is checked in roleService.updateRolePermissions, not here — Zod
// only enforces the request shape (a de-duplicatable array of non-empty
// strings), since the valid-codes catalog lives in the database, not in a
// static list this validator could import safely.
export const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.string().min(1)).max(200),
});
