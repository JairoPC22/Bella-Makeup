import { prisma } from "../config/prisma";
import { Prisma } from "@prisma/client";

export function findProductById(id: string) {
  return prisma.product.findUnique({ where: { id } });
}

export function findImageById(id: string) {
  return prisma.productImage.findUnique({ where: { id } });
}

export function countImagesForProduct(productId: string) {
  return prisma.productImage.count({ where: { productId } });
}

export function createImage(data: Prisma.ProductImageCreateInput) {
  return prisma.productImage.create({ data });
}

export function deleteImage(id: string) {
  return prisma.productImage.delete({ where: { id } });
}

// Unsets any other primary image for the product and sets the target one as
// primary in a single database transaction, so there is never a window where
// two images for the same product are both primary (or none are, if the
// process were interrupted between two separate calls).
export function setPrimaryImage(productId: string, imageId: string) {
  return prisma.$transaction([
    prisma.productImage.updateMany({
      where: { productId, isPrimary: true, NOT: { id: imageId } },
      data: { isPrimary: false },
    }),
    prisma.productImage.update({
      where: { id: imageId },
      data: { isPrimary: true },
    }),
  ]);
}
