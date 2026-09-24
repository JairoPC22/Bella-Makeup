import { prisma } from "../config/prisma";

export function findProductById(id: string) {
  return prisma.product.findUnique({ where: { id } });
}

export function findImageById(id: string) {
  return prisma.productImage.findUnique({ where: { id } });
}

// Marca la imagen como primaria solo si es la primera del producto. El lock
// `FOR UPDATE` sobre el producto evita que dos subidas concurrentes cuenten
// 0 imágenes existentes y ambas se marquen como primarias.
export function createImageWithAutoPrimary(productId: string, url: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId} FOR UPDATE`;
    const existingCount = await tx.productImage.count({ where: { productId } });
    return tx.productImage.create({
      data: {
        product: { connect: { id: productId } },
        url,
        isPrimary: existingCount === 0,
      },
    });
  });
}

export function deleteImage(id: string) {
  return prisma.productImage.delete({ where: { id } });
}

// Quita la marca de primaria a las demás imágenes y la asigna a esta, en
// una sola transacción para evitar estados intermedios inconsistentes.
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
