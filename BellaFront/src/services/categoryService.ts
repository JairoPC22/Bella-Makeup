import { apiFetch } from "./apiClient";
import type { Category } from "../types/api";

export const listCategories = () => apiFetch<Category[]>("/categories");
