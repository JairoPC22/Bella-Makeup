import { ShieldAlert } from "lucide-react";
import { ErrorPage } from "./ErrorPage";

export function AccessDeniedPage() {
  return (
    <ErrorPage
      code="403"
      icon={ShieldAlert}
      title="Acceso denegado"
      message="No tienes permiso para ver esta sección. Si crees que deberías tenerlo, pídele a un administrador que revise tu rol."
      linkTo="/admin"
      linkLabel="Volver al inicio"
    />
  );
}
