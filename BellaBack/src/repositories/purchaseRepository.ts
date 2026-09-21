import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// Shared shape for list/detail/create/receive/cancel responses, mirroring
// transferRepository.ts's `transferInclude` exactly in spirit: supplier and
// branch, the creating/receiving users narrowed to a display-safe subset, and
// items carrying product/variant name+sku so the receiving screen can label
// every line without a second round trip.
//
// The user sub-selects are explicit allow-lists rather than `true` for the
// same reason they are in transferRepository/saleRepository — and that now
// matters twice over, because User carries BOTH `passwordHash` and (as of
// this change) `pinHash`. Selecting the whole relation here would publish a
// bcrypt hash of a 4-6 digit supervisor PIN on every purchase list response.
export const purchaseInclude = {
  supplier: { select: { id: true, name: true, contactName: true, phone: true, email: true, status: true } },
  branch: { select: { id: true, name: true } },
  createdBy: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } },
  receivedBy: { select: { id: true, displayName: true, avatarStyle: true, avatarSeed: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
      variant: { select: { id: true, name: true, sku: true } },
    },
  },
} satisfies Prisma.PurchaseInclude;

export function createPurchase(data: Prisma.PurchaseUncheckedCreateInput, tx: Prisma.TransactionClient = prisma) {
  return tx.purchase.create({ data, include: purchaseInclude });
}

export function createPurchaseItem(
  data: Prisma.PurchaseItemUncheckedCreateInput,
  tx: Prisma.TransactionClient = prisma
) {
  return tx.purchaseItem.create({ data });
}

export function findPurchaseById(id: string, tx: Prisma.TransactionClient = prisma) {
  return tx.purchase.findUnique({ where: { id }, include: purchaseInclude });
}

export function updatePurchaseStatus(
  id: string,
  data: Prisma.PurchaseUncheckedUpdateInput,
  tx: Prisma.TransactionClient = prisma
) {
  return tx.purchase.update({ where: { id }, data, include: purchaseInclude });
}

export function setPurchaseItemReceived(
  id: string,
  receivedQuantity: number,
  tx: Prisma.TransactionClient = prisma
) {
  return tx.purchaseItem.update({ where: { id }, data: { receivedQuantity } });
}

// Records what was actually paid on the most recent real delivery. Kept in
// the repository layer (rather than reaching for prisma.product directly from
// the service) so every Prisma call for this module stays in one file.
export function updateProductCost(productId: string, cost: Prisma.Decimal | number, tx: Prisma.TransactionClient = prisma) {
  return tx.product.update({ where: { id: productId }, data: { cost } });
}

export interface ListPurchasesFilters {
  branchIds?: string[];
  branchId?: string;
  status?: "PENDING" | "COMPLETED" | "RECEIVED_WITH_DISCREPANCIES" | "CANCELLED";
  supplierId?: string;
  from?: Date;
  to?: Date;
}

// Simpler branch clause than listTransfers': a purchase has exactly one
// branch (the receiving one), so there is no source-OR-destination case to
// handle — a purchase is visible to whoever can see the branch it lands in.
export function listPurchases(filters: ListPurchasesFilters) {
  const branchClause = filters.branchId
    ? { branchId: filters.branchId }
    : filters.branchIds
      ? { branchId: { in: filters.branchIds } }
      : {};

  const where: Prisma.PurchaseWhereInput = {
    ...branchClause,
    status: filters.status,
    supplierId: filters.supplierId,
    createdAt: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
  };
  return prisma.purchase.findMany({ where, include: purchaseInclude, orderBy: { createdAt: "desc" } });
}

// ---------- Suppliers ----------
// No branch scoping anywhere below: suppliers are company-wide master data,
// not branch-owned, so every branch orders from the same supplier catalog.

export function listSuppliers(status?: "ACTIVE" | "INACTIVE") {
  return prisma.supplier.findMany({ where: { status }, orderBy: { name: "asc" } });
}

export function findSupplierById(id: string, tx: Prisma.TransactionClient = prisma) {
  return tx.supplier.findUnique({ where: { id } });
}

export function createSupplier(data: Prisma.SupplierUncheckedCreateInput) {
  return prisma.supplier.create({ data });
}

export function updateSupplier(id: string, data: Prisma.SupplierUncheckedUpdateInput) {
  return prisma.supplier.update({ where: { id }, data });
}
