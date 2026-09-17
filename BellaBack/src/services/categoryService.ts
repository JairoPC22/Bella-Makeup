import * as categoryRepository from "../repositories/categoryRepository";
import { logAudit } from "./auditService";
import { AppError } from "../utils/AppError";

export const listCategories = () => categoryRepository.findAllCategories();

export async function createCategory(input: any, actorId: string) {
  const category = await categoryRepository.createCategory(input);
  await logAudit({ userId: actorId, action: "categories.create", module: "products", entityType: "category", entityId: category.id, details: { name: category.name } });
  return category;
}

export async function updateCategory(id: string, input: any, actorId: string) {
  const existing = await categoryRepository.findCategoryById(id);
  if (!existing) throw new AppError(404, "Categoría no encontrada");
  const category = await categoryRepository.updateCategory(id, input);
  await logAudit({ userId: actorId, action: "categories.update", module: "products", entityType: "category", entityId: category.id, details: { changes: input } });
  return category;
}

export async function updateCategoryStatus(id: string, status: "ACTIVE" | "INACTIVE", actorId: string) {
  const category = await categoryRepository.updateCategory(id, { status });
  await logAudit({ userId: actorId, action: status === "ACTIVE" ? "categories.activate" : "categories.deactivate", module: "products", entityType: "category", entityId: category.id });
  return category;
}
