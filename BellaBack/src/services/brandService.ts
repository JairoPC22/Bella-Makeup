import * as brandRepository from "../repositories/brandRepository";
import { logAudit } from "./auditService";
import { AppError } from "../utils/AppError";

export const listBrands = () => brandRepository.findAllBrands();

export async function createBrand(input: any, actorId: string) {
  const brand = await brandRepository.createBrand(input);
  await logAudit({ userId: actorId, action: "brands.create", module: "products", entityType: "brand", entityId: brand.id, details: { name: brand.name } });
  return brand;
}

export async function updateBrand(id: string, input: any, actorId: string) {
  const existing = await brandRepository.findBrandById(id);
  if (!existing) throw new AppError(404, "Marca no encontrada");
  const brand = await brandRepository.updateBrand(id, input);
  await logAudit({ userId: actorId, action: "brands.update", module: "products", entityType: "brand", entityId: brand.id, details: { changes: input } });
  return brand;
}

export async function updateBrandStatus(id: string, status: "ACTIVE" | "INACTIVE", actorId: string) {
  const brand = await brandRepository.updateBrand(id, { status });
  await logAudit({ userId: actorId, action: status === "ACTIVE" ? "brands.activate" : "brands.deactivate", module: "products", entityType: "brand", entityId: brand.id });
  return brand;
}
