import { apiFetch } from "./apiClient";
import type { Product } from "../types/api";

// Read-only, on purpose — product CRUD (create/update/status-change) is a
// separate, not-yet-built workstream. This only exists to power the
// Inventory adjustment modal's product picker.
export const listProducts = (filters?: { categoryId?: string; brandId?: string; status?: Product["status"]; search?: string }) => {
  const params = new URLSearchParams();
  if (filters?.categoryId) params.set("categoryId", filters.categoryId);
  if (filters?.brandId) params.set("brandId", filters.brandId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.search) params.set("search", filters.search);
  const qs = params.toString();
  return apiFetch<Product[]>(`/products${qs ? `?${qs}` : ""}`);
};
