import { Link, NavLink, Outlet } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { useCart } from "./CartContext";
import { CartDrawer } from "./components/CartDrawer";
import "./storefront-shared.css";
import "./StorefrontLayout.css";

// The footer intentionally does NOT call companySettingsService.getCompanySettings()
// — that endpoint is requireAuth-gated server-side (see
// BellaBack/src/routes/companySettings.routes.ts), and this storefront must
// render correctly for a totally anonymous visitor with no session. Rather
// than guess at new backend behavior (e.g. hoping the endpoint gets a
// public exception later), the footer uses static copy for now. When a real
// /api/public/company (or similar) endpoint exists, swap this for a fetch.
const COMPANY_NAME = "Bella Makeup";
const COMPANY_TAGLINE = "Belleza premium, pensada para ti.";

export function StorefrontLayout() {
  const { itemCount, openCart } = useCart();

  return (
    <div className="storefront">
      <header className="storefront-header">
        <div className="storefront-header__inner">
          <Link to="/" className="storefront-header__brand">
            <img src="/brand/logo-full-480.png" alt={COMPANY_NAME} />
          </Link>
          <nav className="storefront-header__nav" aria-label="Navegación principal">
            <NavLink to="/" end className={({ isActive }) => (isActive ? "is-active" : undefined)}>
              Inicio
            </NavLink>
            <NavLink to="/catalogo" className={({ isActive }) => (isActive ? "is-active" : undefined)}>
              Catálogo
            </NavLink>
          </nav>
          <button type="button" className="storefront-header__cart" onClick={openCart} aria-label="Abrir carrito">
            <ShoppingBag size={20} aria-hidden="true" />
            {itemCount > 0 && <span className="storefront-header__cart-badge">{itemCount}</span>}
          </button>
        </div>
      </header>

      <main className="storefront-main">
        <Outlet />
      </main>

      <footer className="storefront-footer">
        <div className="storefront-footer__inner">
          <div className="storefront-footer__brand">
            <img src="/brand/monogram-transparent.png" alt="" aria-hidden="true" />
            <div>
              <p className="storefront-footer__name">{COMPANY_NAME}</p>
              <p className="storefront-footer__tagline">{COMPANY_TAGLINE}</p>
            </div>
          </div>
          <nav className="storefront-footer__links" aria-label="Enlaces de la tienda">
            <Link to="/nosotros">Sobre nosotros</Link>
            <Link to="/preguntas-frecuentes">Preguntas frecuentes</Link>
            <Link to="/envios">Envíos</Link>
          </nav>
          <p className="storefront-footer__copy">
            &copy; {new Date().getFullYear()} {COMPANY_NAME}. Todos los derechos reservados.
          </p>
        </div>
      </footer>

      <CartDrawer />
    </div>
  );
}
