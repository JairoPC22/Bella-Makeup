import * as productRepository from "../repositories/productRepository";
import { logAudit } from "./auditService";
import { AppError } from "../utils/AppError";

export const listProducts = (filters: { categoryId?: string; brandId?: string; status?: "ACTIVE" | "INACTIVE"; search?: string }) =>
  productRepository.findAllProducts(filters);

export async function getProduct(id: string) {
  const product = await productRepository.findProductById(id);
  if (!product) throw new AppError(404, "Producto no encontrado");
  return product;
}

export async function createProduct(input: any, actorId: string) {
  const { variants, ...productData } = input;
  const product = await productRepository.createProductWithVariants(productData, variants ?? []);
  await logAudit({ userId: actorId, action: "products.create", module: "products", entityType: "product", entityId: product.id, details: { name: product.name, sku: product.sku } });
  return product;
}

export async function updateProduct(id: string, input: any, actorId: string) {
  const existing = await productRepository.findProductById(id);
  if (!existing) throw new AppError(404, "Producto no encontrado");
  const { variants, ...productData } = input;
  const product = await productRepository.updateProduct(id, productData);
  await logAudit({ userId: actorId, action: "products.update", module: "products", entityType: "product", entityId: product.id, details: { changes: productData } });
  return product;
}

export async function updateProductStatus(id: string, status: "ACTIVE" | "INACTIVE", actorId: string) {
  const existing = await productRepository.findProductById(id);
  if (!existing) throw new AppError(404, "Producto no encontrado");
  const product = await productRepository.updateProduct(id, { status });
  await logAudit({ userId: actorId, action: status === "ACTIVE" ? "products.activate" : "products.deactivate", module: "products", entityType: "product", entityId: product.id });
  return product;
}
