import { apiFetch } from "./apiClient";

export interface RatingSummary {
  average: number;
  total: number;
  counts: Record<number, number>;
}

export interface SiteRating {
  id: string;
  rating: number;
  comment: string | null;
  page: string | null;
  createdAt: string;
}

// Admin-facing read side (requireAuth + reports.view) — submission itself
// lives on storefrontService.submitSiteRating, the unauthenticated public
// surface. See BellaBack/src/routes/rating.routes.ts.
export function getRatingSummary() {
  return apiFetch<RatingSummary>("/ratings/summary");
}

export function listRatings(page?: number) {
  const qs = page ? `?page=${page}` : "";
  return apiFetch<{ items: SiteRating[]; total: number; page: number; pageSize: number }>(`/ratings${qs}`);
}
