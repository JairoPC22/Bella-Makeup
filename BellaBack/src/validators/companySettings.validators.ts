import { z } from "zod";

export const updateCompanySettingsSchema = z.object({
  companyName: z.string().min(1).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  logoUrl: z.string().optional(),
  currency: z.string().optional(),
  socialLinks: z.record(z.string(), z.string()).optional(),
  description: z.string().max(500).optional(),
  businessHours: z.string().max(200).optional(),
  taxId: z.string().max(50).optional(),
  website: z.string().max(200).optional(),
  returnPolicy: z.string().max(1000).optional(),
  requirePinForDiscounts: z.boolean().optional(),
  requirePinForReturns: z.boolean().optional(),
  requirePinForShrinkage: z.boolean().optional(),
  allowPinForSaleCancel: z.boolean().optional(),
  allowPinForInventoryAdjust: z.boolean().optional(),
});
