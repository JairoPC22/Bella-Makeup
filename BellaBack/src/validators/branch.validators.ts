import { z } from "zod";

export const createBranchSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  schedule: z.string().optional(),
  managerName: z.string().optional(),
});

export const updateBranchSchema = createBranchSchema.partial();

export const updateBranchStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
});
