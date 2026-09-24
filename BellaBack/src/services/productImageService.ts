import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import * as productImageRepository from "../repositories/productImageRepository";
import { UPLOADS_PRODUCTS_DIR } from "../config/multer";
import { logAudit } from "./auditService";
import { AppError } from "../utils/AppError";

const MAX_WIDTH = 1200;

// Redimensiona el archivo que multer ya escribió en disco a un ancho
// máximo, manteniendo el aspect ratio y sin agrandar imágenes pequeñas. Lee
// los bytes originales a memoria primero, en vez de apuntar sharp
// directamente al path y reescribir ese mismo archivo: en Windows no está
// garantizado que sharp cierre el handle de lectura antes de que
// toBuffer() resuelva, y escribir sobre el mismo path mientras sigue abierto
// lanza EBUSY/UNKNOWN. Procesar un buffer en memoria evita eso por completo.
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

  // Una subida corrupta/truncada (bytes que pasan el sniff de MIME de
  // multer pero que libvips no puede decodificar) antes escapaba como un
  // 500 crudo y dejaba huérfano el archivo ya escrito por multer en
  // uploads/products. Igual que la rama de "no encontrado" arriba: se
  // limpia el archivo y se expone como un 400 accionable.
  try {
    await resizeInPlace(file.path);
  } catch {
    await fs.unlink(file.path).catch(() => {});
    throw new AppError(400, "La imagen está dañada o no se pudo procesar");
  }

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
