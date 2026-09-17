import { apiFetch } from "./apiClient";
import type { User } from "../types/api";

export const getProfile = () => apiFetch<User>("/profile");

export const updateProfile = (input: Partial<Pick<User, "firstName" | "lastName" | "displayName" | "email" | "phone">>) =>
  apiFetch<User>("/profile", { method: "PUT", body: JSON.stringify(input) });

export const changePassword = (currentPassword: string, newPassword: string) =>
  apiFetch<{ ok: true }>("/profile/password", { method: "PUT", body: JSON.stringify({ currentPassword, newPassword }) });

export const getAvatarOptions = (count = 6) =>
  apiFetch<Array<{ seed: string; url: string }>>(`/profile/avatar-options?count=${count}`);

export const changeAvatar = (seed: string, style = "adventurer") =>
  apiFetch<User>("/profile/avatar", { method: "PUT", body: JSON.stringify({ seed, style }) });
