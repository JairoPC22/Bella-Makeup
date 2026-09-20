import { Navigate, Outlet } from "react-router-dom";
import { usePermission } from "../../hooks/usePermission";

export function PermissionRoute({ code }: { code: string }) {
  const allowed = usePermission(code);
  if (!allowed) return <Navigate to="/admin/acceso-denegado" replace />;
  return <Outlet />;
}
