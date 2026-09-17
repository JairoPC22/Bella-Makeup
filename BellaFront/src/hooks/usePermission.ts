import { useAuth } from "./useAuth";

export function usePermission(code: string): boolean {
  const { user } = useAuth();
  return !!user?.role.permissions.includes(code);
}
