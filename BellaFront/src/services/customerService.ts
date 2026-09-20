import { apiFetch } from "./apiClient";
import type { Customer } from "../types/api";

export const searchCustomers = (search?: string) => {
  const qs = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  return apiFetch<Customer[]>(`/customers${qs}`);
};

export interface CreateCustomerInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
}

export const createCustomer = (input: CreateCustomerInput) =>
  apiFetch<Customer>("/customers", { method: "POST", body: JSON.stringify(input) });
