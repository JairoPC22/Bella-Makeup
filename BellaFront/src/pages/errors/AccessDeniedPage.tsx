import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import "./ErrorPages.css";

export function AccessDeniedPage() {
  return (
    <div className="error-page">
      <ShieldAlert size={40} />
      <h1>Acceso denegado</h1>
      <p>No tienes permiso para ver esta sección.</p>
      <Link to="/" className="error-page__link">Volver al inicio</Link>
    </div>
  );
}
