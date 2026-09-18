import { apiFetch } from "./apiClient";
import type { Role } from "../types/api";

export const listRoles = () => apiFetch<Role[]>("/roles");

export const updateRolePermissions = (id: string, permissions: string[]) =>
  apiFetch<Role>(`/roles/${id}/permissions`, { method: "PUT", body: JSON.stringify({ permissions }) });
