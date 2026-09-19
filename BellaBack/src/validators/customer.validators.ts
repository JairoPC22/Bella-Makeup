import { z } from "zod";

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
});

// Quick-create from the POS: a cashier ringing up a sale may want to attach
// a customer without leaving the checkout flow. All fields are individually
// optional (a phone-only or name-only customer is fine for a quick capture),
// but at least one of firstName/phone is required — a completely blank row
// (no name, no phone, no email) would be useless for finding the customer
// again later (search is by name/phone/email) and provides no value over
// just leaving customerId unset ("Cliente general"). email is intentionally
// not required-alternative here since it's the least likely field a cashier
// would have on hand at checkout.
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
