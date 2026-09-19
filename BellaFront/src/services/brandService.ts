import { apiFetch } from "./apiClient";
import type { Brand } from "../types/api";

export const listBrands = () => apiFetch<Brand[]>("/brands");

export const createBrand = (name: string) =>
  apiFetch<Brand>("/brands", { method: "POST", body: JSON.stringify({ name }) });
