import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// Igual que el include de returnRepository.ts: `authorizedBy` requiere PIN,
// por eso el select explícito evita filtrar `pinHash`.
export const mermaInclude = {
  branch: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } },
  authorizedBy: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { id: true, name: true, sku: true } },
    },
  },
} satisfies Prisma.MermaInclude;

export function createMerma(data: Prisma.MermaUncheckedCreateInput, tx: Prisma.TransactionClient = prisma) {
  return tx.merma.create({ data, include: mermaInclude });
}

export function createMermaItem(
  data: Prisma.MermaItemUncheckedCreateInput,
  tx: Prisma.TransactionClient = prisma
) {
  return tx.mermaItem.create({ data });
}

export function findMermaById(id: string, tx: Prisma.TransactionClient = prisma) {
  return tx.merma.findUnique({ where: { id }, include: mermaInclude });
}

export interface ListMermasFilters {
  branchIds?: string[];
  branchId?: string;
  type?: "TESTER_EXHIBICION" | "DANO_EN_TIENDA" | "CADUCIDAD_VENCIDO" | "MUESTRA_REGALO_CLIENTE" | "DEFECTO_PROVEEDOR";
  from?: Date;
  to?: Date;
}

export function listMermas(filters: ListMermasFilters) {
  const branchClause = filters.branchId
    ? { branchId: filters.branchId }
    : filters.branchIds
      ? { branchId: { in: filters.branchIds } }
      : {};

  const where: Prisma.MermaWhereInput = {
    ...branchClause,
    type: filters.type,
    createdAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
  };
  return prisma.merma.findMany({ where, include: mermaInclude, orderBy: { createdAt: "desc" } });
}
