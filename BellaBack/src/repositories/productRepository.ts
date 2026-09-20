import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

// Ordered isPrimary first (then sortOrder) so `images[0]` is always the
// product's primary image everywhere a caller just wants "the" thumbnail —
// productImageRepository.ts guarantees exactly one isPrimary: true row per
// product, but sortOrder alone doesn't reliably agree with it (ties are
// possible), so relying on sortOrder alone previously let a non-primary
// image win the [0] slot.
const productInclude = { images: { orderBy: [{ isPrimary: "desc" as const }, { sortOrder: "asc" as const }] }, variants: true, category: true, brand: true };

export function findAllProducts(filters: { categoryId?: string; brandId?: string; status?: "ACTIVE" | "INACTIVE"; search?: string }) {
  const where: Prisma.ProductWhereInput = {
    categoryId: filters.categoryId,
    brandId: filters.brandId,
    status: filters.status,
    OR: filters.search
      ? [
          { name: { contains: filters.search, mode: "insensitive" } },
          { sku: { contains: filters.search, mode: "insensitive" } },
        ]
      : undefined,
  };
  return prisma.product.findMany({ where, include: productInclude, orderBy: { name: "asc" } });
}

export function findProductById(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: { ...productInclude, inventory: { include: { branch: true } } },
  });
}

export function createProductWithVariants(data: Prisma.ProductUncheckedCreateInput, variants: Array<any>) {
  return prisma.product.create({
    data: { ...data, variants: variants?.length ? { create: variants } : undefined },
    include: productInclude,
  });
}

export function updateProduct(id: string, data: Prisma.ProductUncheckedUpdateInput) {
  return prisma.product.update({ where: { id }, data, include: productInclude });
}
