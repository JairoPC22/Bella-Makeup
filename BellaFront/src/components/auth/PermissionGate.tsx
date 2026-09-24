import type { ReactNode } from "react";
import { usePermission, usePermissionAny } from "../../hooks/usePermission";

// Acepta un solo `code` (la mayoría de los casos) o `anyOf` (una lista de
// códigos donde basta con tener CUALQUIERA de ellos) — se usa en secciones
// accesibles por más de un rol, como las pestañas de "Configuración" donde
// Usuarios y Roles tienen cada uno un permiso más específico que settings.manage.
export function PermissionGate({
  code,
  anyOf,
  children,
  fallback = null,
}: {
  code?: string;
  anyOf?: string[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const singleAllowed = usePermission(code ?? "__none__");
  const anyAllowed = usePermissionAny(anyOf ?? []);
  const allowed = code ? singleAllowed : anyAllowed;
  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
