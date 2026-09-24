import { apiFetch } from "./apiClient";
import type { Merma, MermaType } from "../types/api";

export interface MermaItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface CreateMermaInput {
  branchId: string;
  type: MermaType;
  /** Obligatorio, mínimo 3 caracteres: una baja de inventario sin explicación es justo la forma que toma el robo interno. */
  comments: string;
  items: MermaItemInput[];
  /** PIN del supervisor. Solo se exige cuando CompanySettings.requirePinForShrinkage está activo. */
  pinCode?: string;
}

export const createMerma = (input: CreateMermaInput) =>
  apiFetch<Merma>("/mermas", { method: "POST", body: JSON.stringify(input) });

export const listMermas = (filters?: {
  branchId?: string;
  type?: MermaType;
  from?: string;
  to?: string;
}) => {
  const params = new URLSearchParams();
  if (filters?.branchId) params.set("branchId", filters.branchId);
  if (filters?.type) params.set("type", filters.type);
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  const qs = params.toString();
  return apiFetch<Merma[]>(`/mermas${qs ? `?${qs}` : ""}`);
};

export const getMerma = (id: string) => apiFetch<Merma>(`/mermas/${id}`);
