import type { ReactNode } from "react";
import { usePermission } from "../../hooks/usePermission";

export function PermissionGate({
  code,
  children,
  fallback = null,
}: {
  code: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const allowed = usePermission(code);
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
