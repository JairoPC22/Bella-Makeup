import { apiFetch } from "./apiClient";
import type { AuditLogEntry } from "../types/api";

export interface AuditFilters {
  module?: string;
  branchId?: string;
  page?: number;
  pageSize?: number;
}

export function listAudit(filters: AuditFilters) {
  const params = new URLSearchParams();
  if (filters.module) params.set("module", filters.module);
  if (filters.branchId) params.set("branchId", filters.branchId);
  params.set("page", String(filters.page ?? 1));
  params.set("pageSize", String(filters.pageSize ?? 25));
  return apiFetch<{ items: AuditLogEntry[]; total: number; page: number; pageSize: number }>(`/audit?${params.toString()}`);
}
