import { apiFetch } from "./apiClient";
import type { OnlineOrder, OnlineOrderStatus } from "../types/api";

// Authenticated staff surface (/api/orders) — distinct from the public,
// unauthenticated checkout/tracking calls in storefrontService.ts.

export const listOrders = (filters?: { branchId?: string; status?: OnlineOrderStatus; from?: string; to?: string }) => {
  const params = new URLSearchParams();
  if (filters?.branchId) params.set("branchId", filters.branchId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  const qs = params.toString();
  return apiFetch<OnlineOrder[]>(`/orders${qs ? `?${qs}` : ""}`);
};

export const getOrder = (id: string) => apiFetch<OnlineOrder>(`/orders/${id}`);

// `pickupCode` is only meaningful (and only checked server-side) when
// advancing a PICKUP order to COMPLETED — see BellaBack's
// orderService.updateOrderStatus.
export const updateOrderStatus = (
  id: string,
  status: Exclude<OnlineOrderStatus, "PENDING">,
  reason?: string,
  pickupCode?: string
) => apiFetch<OnlineOrder>(`/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason, pickupCode }) });

// `estimatedReadyAt: null` clears a previously-set ETA.
export const setOrderEta = (id: string, estimatedReadyAt: string | null) =>
  apiFetch<OnlineOrder>(`/orders/${id}/eta`, { method: "PATCH", body: JSON.stringify({ estimatedReadyAt }) });
