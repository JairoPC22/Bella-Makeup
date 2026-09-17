import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

export function findAllCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

export function findCategoryById(id: string) {
  return prisma.category.findUnique({ where: { id } });
}

export function createCategory(data: Prisma.CategoryCreateInput) {
  return prisma.category.create({ data });
}

export function updateCategory(id: string, data: Prisma.CategoryUpdateInput) {
  return prisma.category.update({ where: { id }, data });
}
