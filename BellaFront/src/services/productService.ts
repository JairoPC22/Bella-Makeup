import { apiFetch, ApiError } from "./apiClient";
import { buildAttachmentUrl } from "./messageService";
import type { Product, ProductImage } from "../types/api";

// buildAttachmentUrl is fully generic (relativeUrl -> static-file origin +
// relativeUrl) despite its message-oriented name — product images are
// served from the exact same static root (`/uploads/...`) via the exact
// same origin-stripping logic, so this re-exports it under a
// product-flavored name instead of duplicating the origin computation here.
export const buildProductImageUrl = buildAttachmentUrl;

export const listProducts = (filters?: { categoryId?: string; brandId?: string; status?: Product["status"]; search?: string }) => {
  const params = new URLSearchParams();
  if (filters?.categoryId) params.set("categoryId", filters.categoryId);
  if (filters?.brandId) params.set("brandId", filters.brandId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.search) params.set("search", filters.search);
  const qs = params.toString();
  return apiFetch<Product[]>(`/products${qs ? `?${qs}` : ""}`);
};

export const getProduct = (id: string) => apiFetch<Product>(`/products/${id}`);

export interface ProductVariantInput {
  name: string;
  sku: string;
  barcode?: string;
  price?: number;
  minStock: number;
  maxStock?: number;
}

export interface ProductInput {
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  categoryId?: string;
  brandId?: string;
  cost: number;
  price: number;
  promoPrice?: number;
  taxRate: number;
  minStock: number;
  maxStock?: number;
  variants?: ProductVariantInput[];
}

export const createProduct = (input: ProductInput) =>
  apiFetch<Product>("/products", { method: "POST", body: JSON.stringify(input) });

// Top-level fields only, deliberately — see ProductFormModal: the backend's
// updateProduct silently drops any `variants` sent here (productService.ts's
// updateProduct destructures it out before persisting), so this input type
// omits `variants` entirely rather than accepting-and-ignoring it.
export type ProductUpdateInput = Omit<ProductInput, "variants">;

export const updateProduct = (id: string, input: Partial<ProductUpdateInput>) =>
  apiFetch<Product>(`/products/${id}`, { method: "PUT", body: JSON.stringify(input) });

export const updateProductStatus = (id: string, status: Product["status"]) =>
  apiFetch<Product>(`/products/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });

const API_URL = import.meta.env.VITE_API_URL as string;

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export function validateProductImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_MIME.has(file.type)) return "Formato no permitido (solo JPG, PNG o WEBP).";
  if (file.size > MAX_IMAGE_SIZE_BYTES) return "La imagen supera el tamaño máximo de 5MB.";
  return null;
}

// Standalone fetch() rather than apiFetch, same rationale as
// messageService.ts's sendMessage: apiFetch always forces a JSON
// Content-Type header, which would clobber the multipart boundary the
// browser needs to set itself for a FormData body.
export async function uploadProductImage(productId: string, file: File): Promise<ProductImage> {
  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch(`${API_URL}/products/${productId}/images`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? "Error de red");
  }

  return res.json() as Promise<ProductImage>;
}

export const deleteProductImage = (productId: string, imageId: string) =>
  apiFetch<void>(`/products/${productId}/images/${imageId}`, { method: "DELETE" });

export const setPrimaryProductImage = (productId: string, imageId: string) =>
  apiFetch<ProductImage>(`/products/${productId}/images/${imageId}/primary`, { method: "PATCH" });
