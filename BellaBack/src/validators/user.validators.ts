import { z } from "zod";
import { uuidShape } from "./common.validators";

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
