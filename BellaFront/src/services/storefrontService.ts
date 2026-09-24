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

// Datos de contacto (nombre, dirección, teléfono, horarios, redes) para el
// botón flotante de WhatsApp y la página de Ubicación; seguro para anónimos.
export const getPublicCompanyInfo = () => publicFetch<PublicCompanyInfo>("/company");

export const createOnlineOrder = (input: CreateOnlineOrderInput) =>
  publicFetch<OnlineOrder>("/orders", { method: "POST", body: JSON.stringify(input) });

export const trackOnlineOrder = (orderNumber: string, phone: string) =>
  publicFetch<OnlineOrder>(`/orders/${orderNumber}?phone=${encodeURIComponent(phone)}`);

// Usado por PeekRating. `page` es solo la ruta actual para contexto en el
// admin, nunca se usa para identificar al visitante.
export const submitSiteRating = (input: { rating: number; comment?: string; page?: string }) =>
  publicFetch<{ id: string }>("/ratings", { method: "POST", body: JSON.stringify(input) });

// Misma raíz estática /uploads que buildProductImageUrl; se duplica en vez
// de importar para mantener este archivo independiente de todo lo autenticado.
const UPLOADS_ORIGIN = API_URL.replace(/\/api\/?$/, "");
export function buildPublicImageUrl(relativeUrl: string): string {
  if (/^https?:\/\//i.test(relativeUrl)) return relativeUrl;
  return `${UPLOADS_ORIGIN}${relativeUrl}`;
}
