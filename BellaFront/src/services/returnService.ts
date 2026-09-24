import { apiFetch } from "./apiClient";
import type { Return } from "../types/api";

export interface ReturnedItemInput {
  saleItemId: string;
  quantity: number;
  /** Obligatorio, nunca por defecto: si la mercancía puede reingresar es una decisión de quien la recibe. */
  restock: boolean;
}

export interface ReturnNewItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface CreateReturnInput {
  originalSaleId: string;
  returnedItems: ReturnedItemInput[];
  /** Vacío/ausente = reembolso puro, el caso más común. */
  newItems?: ReturnNewItemInput[];
  /** PIN del SUPERVISOR. Solo se exige cuando CompanySettings.requirePinForReturns está activo. */
  pinCode?: string;
  /** Solo relevante cuando la resolución es CUSTOMER_OWES. */
  paymentMethod?: "CASH" | "CARD" | "TRANSFER" | "OTHER";
  notes?: string;
}

export const createReturn = (input: CreateReturnInput) =>
  apiFetch<Return>("/returns", { method: "POST", body: JSON.stringify(input) });

export const listReturns = (filters?: { branchId?: string; from?: string; to?: string }) => {
  const params = new URLSearchParams();
  if (filters?.branchId) params.set("branchId", filters.branchId);
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  const qs = params.toString();
  return apiFetch<Return[]>(`/returns${qs ? `?${qs}` : ""}`);
};

export const getReturn = (id: string) => apiFetch<Return>(`/returns/${id}`);
