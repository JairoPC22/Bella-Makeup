import { z } from "zod";

// La validez real del código (existe en la tabla Permission) se revisa en
// roleService.updateRolePermissions; aquí solo se valida la forma.
export const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.string().min(1)).max(200),
});

// El código es la clave estable usada en JWTs y permisos, por eso va en minúsculas y snake_case.
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
