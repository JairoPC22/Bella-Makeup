import { apiFetch } from "./apiClient";
import type { Supplier } from "../types/api";

// Proveedores viven en su propio recurso /api/suppliers, aunque el servicio
// del backend esté dentro de purchaseService.ts. El permiso está dividido:
// GET usa purchases.view (lo necesita el formulario de compras), POST/PUT
// usan suppliers.manage.

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
