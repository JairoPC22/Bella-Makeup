import { apiFetch } from "./apiClient";
import type { CashBreakdownLine, CashSession } from "../types/api";

export interface OpenCashSessionInput {
  branchId: string;
  openingFloat: number;
}

export interface CloseCashSessionInput {
  cashBreakdown: CashBreakdownLine[];
  cardTotal: number;
}

/**
 * "Do I already have a drawer open here?" — the POS's boot-time question.
 *
 * Resolves to `null` (not a 404) when the caller has no open session at this
 * branch, because the backend controller returns a literal `null` body for
 * that case. A 404 from this endpoint would mean something else entirely.
 *
 * `branchId` is required by the backend's currentCashSessionQuerySchema, so
 * callers must not invoke this before their branch context has resolved.
 */
export const getCurrentSession = (branchId: string) =>
  apiFetch<CashSession | null>(`/cash-sessions/current?branchId=${encodeURIComponent(branchId)}`);

export const openSession = (input: OpenCashSessionInput) =>
  apiFetch<CashSession>("/cash-sessions", { method: "POST", body: JSON.stringify(input) });

/**
 * The blind close. THIS response is the only one in the module that carries
 * systemCashTotal/systemCardTotal/cashDifference/cardDifference — every other
 * endpoint omits them entirely while the session is OPEN. Callers should hold
 * on to the returned object rather than re-fetching, since the reveal is the
 * whole point of the round trip.
 */
export const closeSession = (id: string, input: CloseCashSessionInput) =>
  apiFetch<CashSession>(`/cash-sessions/${id}/close`, { method: "POST", body: JSON.stringify(input) });

/** Requires `cash.audit` — broad listing is manager oversight over other
 * people's drawers, not something a cashier does. */
export const listSessions = (filters?: {
  branchId?: string;
  status?: CashSession["status"];
  from?: string;
  to?: string;
}) => {
  const params = new URLSearchParams();
  if (filters?.branchId) params.set("branchId", filters.branchId);
  if (filters?.status) params.set("status", filters.status);
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  const qs = params.toString();
  return apiFetch<CashSession[]>(`/cash-sessions${qs ? `?${qs}` : ""}`);
};

export const getSession = (id: string) => apiFetch<CashSession>(`/cash-sessions/${id}`);
