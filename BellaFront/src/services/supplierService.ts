import { apiFetch } from "./apiClient";
import type { Supplier } from "../types/api";

// Suppliers live at their own /api/suppliers resource (see BellaBack's
// supplier.routes.ts) even though the backend service code sits inside
// purchaseService.ts — so they get their own frontend service file too,
// matching the URL surface rather than the backend's internal file layout.
//
// Note the split permission gate on the backend: GET is purchases.view (the
// purchase form needs the dropdown), POST/PUT are suppliers.manage.

export interface SupplierInput {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
}

export interface SupplierUpdateInput extends Partial<SupplierInput> {
  status?: Supplier["status"];
}

export const listSuppliers = (filters?: { status?: Supplier["status"] }) => {
  const params = new URLSearchParams();
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString();
  return apiFetch<Supplier[]>(`/suppliers${qs ? `?${qs}` : ""}`);
};

export const createSupplier = (input: SupplierInput) =>
  apiFetch<Supplier>("/suppliers", { method: "POST", body: JSON.stringify(input) });

export const updateSupplier = (id: string, input: SupplierUpdateInput) =>
  apiFetch<Supplier>(`/suppliers/${id}`, { method: "PUT", body: JSON.stringify(input) });
