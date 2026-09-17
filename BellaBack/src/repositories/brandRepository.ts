import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

export function findAllBrands() {
  return prisma.brand.findMany({ orderBy: { name: "asc" } });
}

export function findBrandById(id: string) {
  return prisma.brand.findUnique({ where: { id } });
}

export function createBrand(data: Prisma.BrandCreateInput) {
  return prisma.brand.create({ data });
}

export function updateBrand(id: string, data: Prisma.BrandUpdateInput) {
  return prisma.brand.update({ where: { id }, data });
}
