import { apiFetch } from "./apiClient";
import type { Transfer } from "../types/api";

export interface TransferItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface CreateTransferInput {
  sourceBranchId: string;
  destinationBranchId: string;
  notes?: string;
  items: TransferItemInput[];
}

export const listTransfers = (filters?: {
  branchId?: string;
  status?: Transfer["status"];
  from?: string;
  to?: string;
}) => {
  const params = new URLSearchParams();
  if (filters?.branchId) params.set("branchId", filters.branchId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  const qs = params.toString();
  return apiFetch<Transfer[]>(`/transfers${qs ? `?${qs}` : ""}`);
};

export const getTransfer = (id: string) => apiFetch<Transfer>(`/transfers/${id}`);

export const createTransfer = (input: CreateTransferInput) =>
  apiFetch<Transfer>("/transfers", { method: "POST", body: JSON.stringify(input) });

export const receiveTransfer = (id: string) =>
  apiFetch<Transfer>(`/transfers/${id}/receive`, { method: "POST" });

export const cancelTransfer = (id: string, reason: string) =>
  apiFetch<Transfer>(`/transfers/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
