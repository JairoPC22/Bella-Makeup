import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import * as productImageRepository from "../repositories/productImageRepository";
import { UPLOADS_PRODUCTS_DIR } from "../config/multer";
import { logAudit } from "./auditService";
import { AppError } from "../utils/AppError";

const MAX_WIDTH = 1200;

// Resizes the file multer already wrote to disk down to a max width, keeping
// aspect ratio and never upscaling smaller images. Reads the original bytes
// into memory first (closing the file descriptor) rather than pointing sharp
// directly at the path and writing back to that same path — on Windows the
// read handle sharp opens is not guaranteed closed by the time toBuffer()
// resolves, and writing to the same path while it's still held throws
// EBUSY/UNKNOWN. Processing an in-memory buffer sidesteps that entirely.
async function resizeInPlace(filePath: string): Promise<void> {
  const original = await fs.readFile(filePath);
  const resized = await sharp(original)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .toBuffer();
  await fs.writeFile(filePath, resized);
}

function toRelativeUrl(filename: string): string {
  return `/uploads/products/${filename}`;
}

export async function uploadProductImage(productId: string, file: Express.Multer.File, actorId: string) {
  const product = await productImageRepository.findProductById(productId);
  if (!product) {
    await fs.unlink(file.path).catch(() => {});
    throw new AppError(404, "Producto no encontrado");
  }

  await resizeInPlace(file.path);

  const image = await productImageRepository.createImageWithAutoPrimary(productId, toRelativeUrl(file.filename));

  await logAudit({
    userId: actorId,
    action: "products.images.upload",
    module: "products",
    entityType: "productImage",
    entityId: image.id,
    details: { productId, url: image.url },
  });

  return image;
}

export async function deleteProductImage(productId: string, imageId: string, actorId: string) {
  const image = await productImageRepository.findImageById(imageId);
  if (!image || image.productId !== productId) {
    throw new AppError(404, "Imagen no encontrada");
  }

  await productImageRepository.deleteImage(imageId);

  const absolutePath = path.resolve(UPLOADS_PRODUCTS_DIR, path.basename(image.url));
  await fs.unlink(absolutePath).catch(() => {});

  await logAudit({
    userId: actorId,
    action: "products.images.delete",
    module: "products",
    entityType: "productImage",
    entityId: imageId,
    details: { productId },
  });
}

export async function setPrimaryProductImage(productId: string, imageId: string, actorId: string) {
  const image = await productImageRepository.findImageById(imageId);
  if (!image || image.productId !== productId) {
    throw new AppError(404, "Imagen no encontrada");
  }

  await productImageRepository.setPrimaryImage(productId, imageId);

  await logAudit({
    userId: actorId,
    action: "products.images.set_primary",
    module: "products",
    entityType: "productImage",
    entityId: imageId,
    details: { productId },
  });

  return productImageRepository.findImageById(imageId);
}
