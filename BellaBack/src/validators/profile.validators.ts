import { z } from "zod";

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

export const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export const updateAvatarSchema = z.object({
  style: z.string().default("adventurer"),
  seed: z.string().min(1),
});
