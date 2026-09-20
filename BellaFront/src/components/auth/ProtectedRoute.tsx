import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { StatusState } from "../common/StatusState";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <StatusState kind="loading" message="Verificando sesión..." />;
  if (!user) return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}
