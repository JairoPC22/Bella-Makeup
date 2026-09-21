import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { AtSign, Banknote, Clock3, CreditCard, Landmark, MapPin, Phone, ShoppingBag, Sparkles, Store, Truck } from "lucide-react";
import { useCart } from "./CartContext";
import { CartDrawer } from "./components/CartDrawer";
import { WhatsAppButton } from "./components/WhatsAppButton";
import { ScrollToTopButton } from "./components/ScrollToTopButton";
import { getPublicCompanyInfo, listPublicBranches } from "../services/storefrontService";
import type { PublicBranch, PublicCompanyInfo } from "../types/api";
import "./storefront-shared.css";
import "./StorefrontLayout.css";

// The footer previously hardcoded the company name and had a comment
// explaining that companySettingsService.getCompanySettings() is
// requireAuth-gated server-side and therefore unusable from an anonymous
// storefront. That is still true of *that* endpoint — but a genuinely
// public read model has existed since: GET /api/public/company
// (BellaBack/src/routes/public.routes.ts, mounted with no requireAuth),
// already typed as PublicCompanyInfo and already consumed by
// WhatsAppButton.tsx. The footer now uses it too, so the address, phone
// and social links a visitor sees are the real configured ones rather
// than static copy. It still degrades to the constants below if the
// request fails, so an offline backend never blanks the footer.
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
  const [company, setCompany] = useState<PublicCompanyInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPublicBranches()
      .then((data) => {
        if (!cancelled && data.length > 0) setPrimaryBranch(data[0]);
      })
      .catch(() => {});
    getPublicCompanyInfo()
      .then((info) => {
        if (!cancelled) setCompany(info);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const companyName = company?.companyName ?? COMPANY_NAME;
  const address = company?.address ?? primaryBranch?.address ?? null;
  const phone = company?.phone ?? primaryBranch?.phone ?? null;
  const hours = company?.businessHours ?? primaryBranch?.schedule ?? null;
  const instagram = company?.socialLinks?.instagram ?? null;

  return (
    <div className="storefront">
      {/* Thin announcement rail above the sticky header — the standard
          premium-retail device for surfacing the two things that actually
          reduce purchase hesitation here (free in-store pickup, home
          delivery) without stealing space from the hero. */}
      <div className="storefront-announce">
        <div className="storefront-announce__inner">
          <span><Store size={13} aria-hidden="true" /> Retiro gratis en sucursal</span>
          <span className="storefront-announce__dot" aria-hidden="true" />
          <span><Truck size={13} aria-hidden="true" /> Entrega a domicilio</span>
          <span className="storefront-announce__dot" aria-hidden="true" />
          <span><Sparkles size={13} aria-hidden="true" /> Productos 100% originales</span>
        </div>
      </div>

      <header className="storefront-header">
        <div className="storefront-header__inner">
          <Link to="/" className="storefront-header__brand">
            <img src="/brand/logo-full-480.png" alt={companyName} />
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
            <ShoppingBag size={18} aria-hidden="true" />
            <span className="storefront-header__cart-label">Carrito</span>
            {itemCount > 0 && <span className="storefront-header__cart-badge">{itemCount}</span>}
          </button>
        </div>
      </header>

      <main className="storefront-main">
        <Outlet />
      </main>

      <footer className="storefront-footer">
        <div className="storefront-footer__inner">
          <div className="storefront-footer__col storefront-footer__col--brand">
            <div className="storefront-footer__brand">
              <img src="/brand/monogram-transparent.png" alt="" aria-hidden="true" />
              <div>
                <p className="storefront-footer__name">{companyName}</p>
                <p className="storefront-footer__tagline">{COMPANY_TAGLINE}</p>
              </div>
            </div>
            <p className="storefront-footer__blurb">
              Maquillaje y cuidado de la piel seleccionados con criterio, con la misma asesoría que
              recibes en sucursal.
            </p>
            {instagram && (
              <a
                className="storefront-footer__social"
                href={instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
              >
                <AtSign size={16} aria-hidden="true" />
              </a>
            )}
          </div>

          <div className="storefront-footer__col">
            <p className="storefront-footer__col-title">Tienda</p>
            <nav className="storefront-footer__links" aria-label="Enlaces de la tienda">
              <Link to="/">Inicio</Link>
              <Link to="/catalogo">Catálogo</Link>
              <Link to="/nosotros">Sobre nosotros</Link>
            </nav>
          </div>

          <div className="storefront-footer__col">
            <p className="storefront-footer__col-title">Ayuda</p>
            <nav className="storefront-footer__links" aria-label="Enlaces de ayuda">
              <Link to="/preguntas-frecuentes">Preguntas frecuentes</Link>
              <Link to="/envios">Envíos y entregas</Link>
              <Link to="/ubicacion">Ubicación</Link>
            </nav>
          </div>

          <div className="storefront-footer__col storefront-footer__col--contact">
            <p className="storefront-footer__col-title">Contacto</p>
            <ul className="storefront-footer__facts">
              {address && (
                <li><MapPin size={14} aria-hidden="true" /><span>{address}</span></li>
              )}
              {phone && (
                <li><Phone size={14} aria-hidden="true" /><span>{phone}</span></li>
              )}
              {hours && (
                <li><Clock3 size={14} aria-hidden="true" /><span>{hours}</span></li>
              )}
            </ul>
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
                  Ver todas las sucursales
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="storefront-footer__bar">
          <div className="storefront-footer__bar-inner">
            <p className="storefront-footer__copy">
              &copy; {new Date().getFullYear()} {companyName}. Todos los derechos reservados.
            </p>
            {/* Mirrors exactly what CheckoutPage actually offers — three
                methods, all settled in person. No card-network logos,
                because no online card processing happens here. */}
            <ul className="storefront-footer__pay" aria-label="Métodos de pago aceptados">
              <li><Banknote size={13} aria-hidden="true" /> Efectivo</li>
              <li><CreditCard size={13} aria-hidden="true" /> Tarjeta</li>
              <li><Landmark size={13} aria-hidden="true" /> Transferencia</li>
            </ul>
          </div>
        </div>
      </footer>

      <CartDrawer />
      <WhatsAppButton />
      <ScrollToTopButton />
    </div>
  );
}
