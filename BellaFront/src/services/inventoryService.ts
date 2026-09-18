import { apiFetch } from "./apiClient";
import type { InventoryRow } from "../types/api";

// Minimal service — just enough to feed the dashboard's low-stock widget.
// The full Inventory page (filters, adjustments, movement history) is a
// separate, not-yet-built workstream; this intentionally doesn't try to
// cover that scope.
export const listInventory = (filters?: { branchId?: string; status?: InventoryRow["status"] }) => {
  const params = new URLSearchParams();
  if (filters?.branchId) params.set("branchId", filters.branchId);
  if (filters?.status) params.set("status", filters.status);
  const qs = params.toString();
  return apiFetch<InventoryRow[]>(`/inventory${qs ? `?${qs}` : ""}`);
};
