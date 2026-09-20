import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { useCart } from "./CartContext";
import { CartDrawer } from "./components/CartDrawer";
import { WhatsAppButton } from "./components/WhatsAppButton";
import { ScrollToTopButton } from "./components/ScrollToTopButton";
import { listPublicBranches } from "../services/storefrontService";
import type { PublicBranch } from "../types/api";
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

function footerMapSrc(branch: PublicBranch): string {
  const query = branch.address ? `${branch.name}, ${branch.address}` : branch.name;
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

export function StorefrontLayout() {
  const { itemCount, openCart } = useCart();

  // Small footer map preview ("el maps en pequeño en la sección de abajo")
  // — there's no "is this the main branch" concept in PublicBranch, so this
  // just uses branches[0] (the /api/public/branches list's first/primary
  // entry) same as the task called for.
  const [primaryBranch, setPrimaryBranch] = useState<PublicBranch | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPublicBranches()
      .then((data) => {
        if (!cancelled && data.length > 0) setPrimaryBranch(data[0]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
            <NavLink to="/nosotros" className={({ isActive }) => (isActive ? "is-active" : undefined)}>
              Nosotros
            </NavLink>
            <NavLink to="/preguntas-frecuentes" className={({ isActive }) => (isActive ? "is-active" : undefined)}>
              FAQ
            </NavLink>
            <NavLink to="/ubicacion" className={({ isActive }) => (isActive ? "is-active" : undefined)}>
              Ubicación
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
            <Link to="/ubicacion">Ubicación</Link>
          </nav>
          {primaryBranch && (
            <div className="storefront-footer__map">
              <div className="storefront-footer__map-frame">
                <iframe
                  src={footerMapSrc(primaryBranch)}
                  title={`Mapa de ${primaryBranch.name}`}
                  loading="lazy"
                  style={{ border: 0 }}
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <Link to="/ubicacion" className="storefront-footer__map-link">
                Ver ubicación
              </Link>
            </div>
          )}
          <p className="storefront-footer__copy">
            &copy; {new Date().getFullYear()} {COMPANY_NAME}. Todos los derechos reservados.
          </p>
        </div>
      </footer>

      <CartDrawer />
      <WhatsAppButton />
      <ScrollToTopButton />
    </div>
  );
}
