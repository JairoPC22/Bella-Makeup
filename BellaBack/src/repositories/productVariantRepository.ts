import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// Standalone variant operations, separate from the nested create that happens
// as part of productRepository.createProductWithVariants. Used by later
// inventory/variant-management tasks that need to look up or mutate a single
// variant row directly (e.g. resolving a variantId for a stock movement).

export function findVariantById(id: string) {
  return prisma.productVariant.findUnique({ where: { id } });
}

export function findVariantsByProductId(productId: string) {
  return prisma.productVariant.findMany({ where: { productId } });
}

export function createVariant(data: Prisma.ProductVariantUncheckedCreateInput) {
  return prisma.productVariant.create({ data });
}

export function updateVariant(id: string, data: Prisma.ProductVariantUncheckedUpdateInput) {
  return prisma.productVariant.update({ where: { id }, data });
}

export function deleteVariant(id: string) {
  return prisma.productVariant.delete({ where: { id } });
}
