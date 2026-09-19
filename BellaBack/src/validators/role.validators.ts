import { z } from "zod";

// Actual permission-code validity (does the code exist in the Permission
// table?) is checked in roleService.updateRolePermissions, not here — Zod
// only enforces the request shape (a de-duplicatable array of non-empty
// strings), since the valid-codes catalog lives in the database, not in a
// static list this validator could import safely.
export const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.string().min(1)).max(200),
});

// Codes are the stable, immutable key used in JWTs/seed data/permission
// checks elsewhere, so they're kept lowercase-snake and short instead of
// letting the display name double as an identifier.
export const createRoleSchema = z.object({
  code: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, "El código debe iniciar con una letra minúscula y solo contener minúsculas, números y guion bajo"),
  name: z.string().min(2).max(100),
  description: z.string().min(1).max(500),
  permissions: z.array(z.string().min(1)).max(200).optional().default([]),
});
