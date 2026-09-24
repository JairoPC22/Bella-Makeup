import { Navigate, Outlet } from "react-router-dom";
import { usePermission, usePermissionAny } from "../../hooks/usePermission";

export function PermissionRoute({ code, anyOf }: { code?: string; anyOf?: string[] }) {
  const singleAllowed = usePermission(code ?? "__none__");
  const anyAllowed = usePermissionAny(anyOf ?? []);
  const allowed = code ? singleAllowed : anyAllowed;
  if (!allowed) return <Navigate to="/admin/acceso-denegado" replace />;
  return <Outlet />;
}
