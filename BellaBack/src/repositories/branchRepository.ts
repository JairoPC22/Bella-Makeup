import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

export function findAllBranches() {
  return prisma.branch.findMany({ orderBy: { name: "asc" } });
}

export function findBranchById(id: string) {
  return prisma.branch.findUnique({ where: { id } });
}

export function createBranch(data: Prisma.BranchCreateInput) {
  return prisma.branch.create({ data });
}

export function updateBranch(id: string, data: Prisma.BranchUpdateInput) {
  return prisma.branch.update({ where: { id }, data });
}
