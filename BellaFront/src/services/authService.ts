import { apiFetch } from "./apiClient";
import type { User } from "../types/api";

export function login(username: string, password: string) {
  return apiFetch<{ user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
}

export function logout() {
  return apiFetch<{ ok: true }>("/auth/logout", { method: "POST" });
}

export function me() {
  return apiFetch<{ user: User }>("/auth/me");
}
