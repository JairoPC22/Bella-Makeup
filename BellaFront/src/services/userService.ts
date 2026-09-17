import { apiFetch } from "./apiClient";
import type { User } from "../types/api";

export const listUsers = () => apiFetch<User[]>("/users");

export const createUser = (input: { firstName: string; lastName: string; displayName: string; username: string; email: string; phone?: string; password: string; roleId: string }) =>
  apiFetch<User>("/users", { method: "POST", body: JSON.stringify(input) });

export const updateUser = (id: string, input: Partial<Pick<User, "firstName" | "lastName" | "displayName" | "email" | "phone" | "roleId">>) =>
  apiFetch<User>(`/users/${id}`, { method: "PUT", body: JSON.stringify(input) });

export const updateUserStatus = (id: string, status: "ACTIVE" | "DISABLED") =>
  apiFetch<User>(`/users/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });

export const assignBranches = (id: string, branchIds: string[], allBranches: boolean) =>
  apiFetch<User>(`/users/${id}/branches`, { method: "PUT", body: JSON.stringify({ branchIds, allBranches }) });
