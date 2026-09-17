import { apiFetch } from "./apiClient";
import type { Branch } from "../types/api";

export const listBranches = () => apiFetch<Branch[]>("/branches");
export const createBranch = (input: Partial<Branch>) => apiFetch<Branch>("/branches", { method: "POST", body: JSON.stringify(input) });
export const updateBranch = (id: string, input: Partial<Branch>) => apiFetch<Branch>(`/branches/${id}`, { method: "PUT", body: JSON.stringify(input) });
export const updateBranchStatus = (id: string, status: "ACTIVE" | "INACTIVE") => apiFetch<Branch>(`/branches/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
