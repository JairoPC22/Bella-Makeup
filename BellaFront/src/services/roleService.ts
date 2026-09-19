import { apiFetch } from "./apiClient";
import type { Role } from "../types/api";

export const listRoles = () => apiFetch<Role[]>("/roles");

export const updateRolePermissions = (id: string, permissions: string[]) =>
  apiFetch<Role>(`/roles/${id}/permissions`, { method: "PUT", body: JSON.stringify({ permissions }) });

export interface CreateRoleInput {
  code: string;
  name: string;
  description: string;
  permissions: string[];
}

export const createRole = (input: CreateRoleInput) =>
  apiFetch<Role>("/roles", { method: "POST", body: JSON.stringify(input) });

export const deleteRole = (id: string) => apiFetch<void>(`/roles/${id}`, { method: "DELETE" });
