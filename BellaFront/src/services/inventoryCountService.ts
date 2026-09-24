import { apiFetch } from "./apiClient";
import type { InventoryCount } from "../types/api";

export interface CreateInventoryCountInput {
  branchId: string;
  categoryId?: string;
  brandId?: string;
  productIds?: string[];
  notes?: string;
}

export const listInventoryCounts = (filters?: { branchId?: string; status?: InventoryCount["status"] }) => {
  const params = new URLSearchParams();
  if (filters?.branchId) params.set("branchId", filters.branchId);
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString();
  return apiFetch<InventoryCount[]>(`/inventory-counts${qs ? `?${qs}` : ""}`);
};

export const getInventoryCount = (id: string) => apiFetch<InventoryCount>(`/inventory-counts/${id}`);

export const createInventoryCount = (input: CreateInventoryCountInput) =>
  apiFetch<InventoryCount>("/inventory-counts", { method: "POST", body: JSON.stringify(input) });

export const saveCountedItems = (id: string, items: { itemId: string; countedStock: number }[]) =>
  apiFetch<InventoryCount>(`/inventory-counts/${id}/items`, { method: "PATCH", body: JSON.stringify({ items }) });

export const completeInventoryCount = (id: string) =>
  apiFetch<InventoryCount>(`/inventory-counts/${id}/complete`, { method: "POST" });

export const cancelInventoryCount = (id: string) =>
  apiFetch<InventoryCount>(`/inventory-counts/${id}/cancel`, { method: "POST" });
