import { useAuth } from "./useAuth";

export function usePermission(code: string): boolean {
  const { user } = useAuth();
  return !!user?.role.permissions.includes(code);
}

export function usePermissionAny(codes: string[]): boolean {
  const { user } = useAuth();
  return codes.some((code) => !!user?.role.permissions.includes(code));
}
