import { apiFetch } from "./apiClient";
import type { CompanySettings } from "../types/api";

export const getCompanySettings = () => apiFetch<CompanySettings>("/company-settings");
export const updateCompanySettings = (input: Partial<CompanySettings>) =>
  apiFetch<CompanySettings>("/company-settings", { method: "PUT", body: JSON.stringify(input) });
