import { apiFetch } from "./apiClient";
import type { Sale } from "../types/api";

export interface SaleItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
  discount?: number;
}

export interface SalePaymentInput {
  method: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  amount: number;
  reference?: string;
}

export interface CreateSaleInput {
  branchId: string;
  customerId?: string;
  items: SaleItemInput[];
  payments: SalePaymentInput[];
}

export const listSales = (filters?: { branchId?: string; status?: Sale["status"]; from?: string; to?: string }) => {
  const params = new URLSearchParams();
  if (filters?.branchId) params.set("branchId", filters.branchId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  const qs = params.toString();
  return apiFetch<Sale[]>(`/sales${qs ? `?${qs}` : ""}`);
};

export const getSale = (id: string) => apiFetch<Sale>(`/sales/${id}`);

export const createSale = (input: CreateSaleInput) =>
  apiFetch<Sale>("/sales", { method: "POST", body: JSON.stringify(input) });

export const cancelSale = (id: string, reason: string) =>
  apiFetch<Sale>(`/sales/${id}/cancel`, { method: "PATCH", body: JSON.stringify({ reason }) });
