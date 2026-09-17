import { z } from "zod";

export const updateCompanySettingsSchema = z.object({
  companyName: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  logoUrl: z.string().optional(),
  currency: z.string().optional(),
  socialLinks: z.record(z.string(), z.string()).optional(),
});
