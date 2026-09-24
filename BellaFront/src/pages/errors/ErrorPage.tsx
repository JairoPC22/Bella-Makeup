import { Link } from "react-router-dom";
import { ArrowRight, type LucideIcon } from "lucide-react";
import "./ErrorPage.css";

// Página de error compartida (404 y 403), reutiliza el estilo de panel
// oscuro de LoginPage.css para que se vea parte de la marca, no un
// error genérico del framework sin estilo.
export function ErrorPage({
  code,
  icon: Icon,
  title,
  message,
  linkTo,
  linkLabel,
}: {
  code: string;
  icon: LucideIcon;
  title: string;
  message: string;
  linkTo: string;
  linkLabel: string;
}) {
  return (
    <div className="error-page">
      <div className="error-page__glow" aria-hidden="true" />
      <div className="error-page__grid" aria-hidden="true" />
      <div className="error-page__content">
        <Link to="/" className="error-page__brand">
          <img src="/brand/logo-full-480.png" alt="Bella Makeup" />
        </Link>
        <div className="error-page__icon"><Icon size={26} aria-hidden="true" /></div>
        <p className="error-page__code">{code}</p>
        <h1>{title}</h1>
        <p className="error-page__message">{message}</p>
        <Link to={linkTo} className="error-page__cta">
          {linkLabel} <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
