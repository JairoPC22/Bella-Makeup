import { apiFetch } from "./apiClient";
import type { Category } from "../types/api";

export const listCategories = () => apiFetch<Category[]>("/categories");

export const createCategory = (name: string) =>
  apiFetch<Category>("/categories", { method: "POST", body: JSON.stringify({ name }) });
