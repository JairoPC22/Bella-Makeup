import type { ReactNode } from "react";
import { usePermission } from "../../hooks/usePermission";

export function PermissionGate({ code, children }: { code: string; children: ReactNode }) {
  const allowed = usePermission(code);
  if (!allowed) return null;
  return <>{children}</>;
}
