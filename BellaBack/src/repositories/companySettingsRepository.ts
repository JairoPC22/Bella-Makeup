import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

export async function getCompanySettings() {
  const existing = await prisma.companySettings.findFirst();
  if (existing) return existing;
  return prisma.companySettings.create({ data: { companyName: "Bella Makeup" } });
}

export async function updateCompanySettings(id: string, data: Prisma.CompanySettingsUpdateInput) {
  return prisma.companySettings.update({ where: { id }, data });
}
