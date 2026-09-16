import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

export interface AuditFilters {
  userId?: string;
  module?: string;
  branchId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export function createAuditLog(data: Prisma.AuditLogUncheckedCreateInput) {
  return prisma.auditLog.create({ data });
}

export async function findAuditLogs(filters: AuditFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const where: Prisma.AuditLogWhereInput = {
    userId: filters.userId,
    module: filters.module,
    branchId: filters.branchId,
    createdAt: {
      gte: filters.from,
      lte: filters.to,
    },
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: true, branch: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total };
}
