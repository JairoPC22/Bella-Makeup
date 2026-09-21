import { apiFetch } from "./apiClient";
import type { Purchase } from "../types/api";

// Same convention as transferService.ts: thin typed wrappers over apiFetch,
// one per backend route, with the request bodies typed to match BellaBack's
// purchase.validators.ts exactly.

export interface PurchaseItemInput {
  productId: string;
  variantId?: string;
  expectedQuantity: number;
  unitCost: number;
}

export interface CreatePurchaseInput {
  supplierId: string;
  branchId: string;
  reference?: string;
  notes?: string;
  items: PurchaseItemInput[];
}

export interface ReceivePurchaseItemInput {
  purchaseItemId: string;
  receivedQuantity: number;
}

export interface ReceivePurchaseInput {
  items: ReceivePurchaseItemInput[];
}

export const listPurchases = (filters?: {
  branchId?: string;
  status?: Purchase["status"];
  supplierId?: string;
  from?: string;
  to?: string;
}) => {
  const params = new URLSearchParams();
  if (filters?.branchId) params.set("branchId", filters.branchId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.supplierId) params.set("supplierId", filters.supplierId);
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  const qs = params.toString();
  return apiFetch<Purchase[]>(`/purchases${qs ? `?${qs}` : ""}`);
};

export const getPurchase = (id: string) => apiFetch<Purchase>(`/purchases/${id}`);

export const createPurchase = (input: CreatePurchaseInput) =>
  apiFetch<Purchase>("/purchases", { method: "POST", body: JSON.stringify(input) });

export const receivePurchase = (id: string, input: ReceivePurchaseInput) =>
  apiFetch<Purchase>(`/purchases/${id}/receive`, { method: "POST", body: JSON.stringify(input) });

export const cancelPurchase = (id: string, reason: string) =>
  apiFetch<Purchase>(`/purchases/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
