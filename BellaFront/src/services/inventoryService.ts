import { apiFetch } from "./apiClient";
import type { InventoryMovement, InventoryRow } from "../types/api";

// listInventory se mantiene compatible con el widget de stock bajo del
// dashboard; categoryId + adjustInventory + listMovements se agregaron
// después para la página completa de Inventario.
export const listInventory = (filters?: { branchId?: string; categoryId?: string; status?: InventoryRow["status"] }) => {
  const params = new URLSearchParams();
  if (filters?.branchId) params.set("branchId", filters.branchId);
  if (filters?.categoryId) params.set("categoryId", filters.categoryId);
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString();
  return apiFetch<InventoryRow[]>(`/inventory${qs ? `?${qs}` : ""}`);
};

export interface AdjustInventoryInput {
  productId: string;
  variantId?: string;
  branchId: string;
  quantity: number;
  reason: string;
  pinCode?: string;
}

export const adjustInventory = (input: AdjustInventoryInput) =>
  apiFetch<InventoryMovement>("/inventory/adjust", { method: "POST", body: JSON.stringify(input) });

export const listMovements = (productId: string, variantId?: string) => {
  const qs = variantId ? `?variantId=${variantId}` : "";
  return apiFetch<InventoryMovement[]>(`/inventory/${productId}/movements${qs}`);
};
