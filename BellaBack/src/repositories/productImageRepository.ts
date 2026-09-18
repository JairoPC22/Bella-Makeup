import { prisma } from "../config/prisma";

export function findProductById(id: string) {
  return prisma.product.findUnique({ where: { id } });
}

export function findImageById(id: string) {
  return prisma.productImage.findUnique({ where: { id } });
}

// Creates a ProductImage row, auto-marking it primary only when it's the
// product's first image. The count-then-decide-then-insert logic runs inside
// a transaction that first takes a row lock on the parent Product
// (`SELECT ... FOR UPDATE`). That lock is what actually closes the race, not
// the transaction by itself: Postgres's default READ COMMITTED isolation
// lets two concurrent transactions each run `count()` before either has
// committed its `create()`, so without an explicit lock both could still
// observe existingCount === 0 and both insert isPrimary: true. Locking the
// product row forces a second concurrent upload for the same product to
// block until the first transaction commits, so its count() (re-run after
// the wait, inside the same transaction) correctly sees the first image and
// creates itself as non-primary.
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
