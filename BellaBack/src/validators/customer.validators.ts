import { z } from "zod";

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
});

// Creación rápida desde el POS: todos los campos son opcionales, pero se
// requiere al menos nombre o teléfono para que el cliente sea localizable después.
export const createCustomerSchema = z
  .object({
    firstName: z.string().trim().min(1).optional(),
    lastName: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
  })
  .refine((data) => Boolean(data.firstName || data.phone), {
    message: "Se requiere al menos nombre o teléfono",
    path: ["firstName"],
  });
