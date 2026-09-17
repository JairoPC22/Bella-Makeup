import { apiFetch } from "./apiClient";
import type { Role } from "../types/api";

export const listRoles = () => apiFetch<Role[]>("/roles");
