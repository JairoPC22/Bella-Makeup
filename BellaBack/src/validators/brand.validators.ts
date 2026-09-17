import { z } from "zod";

export const createBrandSchema = z.object({
  name: z.string().min(1),
});

export const updateBrandSchema = createBrandSchema.partial();

export const updateBrandStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
