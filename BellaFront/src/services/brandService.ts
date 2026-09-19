import { apiFetch } from "./apiClient";
import type { Brand } from "../types/api";

export const listBrands = () => apiFetch<Brand[]>("/brands");
