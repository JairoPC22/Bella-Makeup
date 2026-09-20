import type {
  CreateOnlineOrderInput,
  OnlineOrder,
  PublicBranch,
  PublicCategory,
  PublicCompanyInfo,
  PublicProduct,
  PublicProductListResponse,
} from "../types/api";

// Deliberately NOT reusing apiClient.ts's apiFetch here. apiFetch is built
// around the authenticated admin session (it fires a POST /auth/refresh on
// any 401 and always sends credentials: "include"), which is harmless
// against a public endpoint that ignores auth, but is the wrong mental
// model for this file — the storefront is a genuinely separate,
// unauthenticated surface, so it gets its own minimal fetch wrapper rather
// than borrowing one designed around "am I still logged in". Error shape
// mirrors ApiError from apiClient.ts (status + message) so callers can
// handle both consistently.
const API_URL = import.meta.env.VITE_API_URL as string;
// /api/public/* — a sibling root next to the authenticated /api/* routes
// apiClient.ts targets, not nested under them. API_URL already ends in
// /api (see .env.example), so this only appends /public.
const PUBLIC_API_URL = `${API_URL}/public`;

export class PublicApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function publicFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${PUBLIC_API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new PublicApiError(res.status, body.message ?? "Error de red");
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const listPublicCategories = () => publicFetch<PublicCategory[]>("/categories");

export const listPublicProducts = (params?: { categoryId?: string; search?: string; page?: number }) => {
  const qs = new URLSearchParams();
  if (params?.categoryId) qs.set("categoryId", params.categoryId);
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  const query = qs.toString();
  return publicFetch<PublicProductListResponse>(`/products${query ? `?${query}` : ""}`);
};

export const getPublicProduct = (id: string) => publicFetch<PublicProduct>(`/products/${id}`);

export const listPublicBranches = () => publicFetch<PublicBranch[]>("/branches");

// Backs the floating WhatsApp button (StorefrontLayout) and the Ubicación
// page's contact details — company name/address/phone/hours/social links,
// safe for a fully anonymous visitor.
export const getPublicCompanyInfo = () => publicFetch<PublicCompanyInfo>("/company");

export const createOnlineOrder = (input: CreateOnlineOrderInput) =>
  publicFetch<OnlineOrder>("/orders", { method: "POST", body: JSON.stringify(input) });

export const trackOnlineOrder = (orderNumber: string, phone: string) =>
  publicFetch<OnlineOrder>(`/orders/${orderNumber}?phone=${encodeURIComponent(phone)}`);

// Product images are served from the same static /uploads root as the
// admin product images (see productService.ts's buildProductImageUrl) —
// mirrored here rather than imported, since that function lives alongside
// the authenticated messageService import chain and this file is meant to
// stay fully independent of anything auth-related.
const UPLOADS_ORIGIN = API_URL.replace(/\/api\/?$/, "");
export function buildPublicImageUrl(relativeUrl: string): string {
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
  return `${UPLOADS_ORIGIN}${relativeUrl}`;
}
