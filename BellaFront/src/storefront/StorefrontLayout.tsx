import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { AtSign, Banknote, Clock3, CreditCard, Landmark, MapPin, Menu, Phone, ShoppingBag, Sparkles, Store, Truck, X } from "lucide-react";
import { useCart } from "./CartContext";
import { CartDrawer } from "./components/CartDrawer";
import { WhatsAppButton } from "./components/WhatsAppButton";
import { ScrollToTopButton } from "./components/ScrollToTopButton";
import { getPublicCompanyInfo, listPublicBranches } from "../services/storefrontService";
import PeekRating from "../components/common/PeekRating";
import { useScrollLock } from "../hooks/useScrollLock";
import type { PublicBranch, PublicCompanyInfo } from "../types/api";
import "./storefront-shared.css";
import "./StorefrontLayout.css";

// El footer usa el endpoint público GET /api/public/company (sin
// requireAuth, ya consumido también por WhatsAppButton.tsx) para mostrar
// dirección, teléfono y redes reales en vez de texto estático. Si la
// petición falla, degrada a las constantes de abajo.
const COMPANY_NAME = "Bella Makeup";
const COMPANY_TAGLINE = "Belleza premium, pensada para ti.";

function footerMapSrc(branch: PublicBranch): string {
  const query = branch.address ? `${branch.name}, ${branch.address}` : branch.name;
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

const NAV_LINKS: Array<{ to: string; label: string; end?: boolean }> = [
  { to: "/", label: "Inicio", end: true },
  { to: "/catalogo", label: "Catálogo" },
  { to: "/nosotros", label: "Nosotros" },
  { to: "/preguntas-frecuentes", label: "FAQ" },
  { to: "/ubicacion", label: "Ubicación" },
];

// Nav con animación de "pill" usando el shared-layout de `motion` (mismo
// motor de animación que el resto del proyecto). Un solo motion.span con
// layoutId compartido vive dentro del link activo; al cambiar de ruta,
// motion anima ese span de su posición vieja a la nueva automáticamente.
function StorefrontNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV_LINKS.map(({ to, label, end }) => (
        <NavLink key={to} to={to} end={end} onClick={onNavigate} className={({ isActive }) => (isActive ? "is-active" : undefined)}>
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="storefront-nav-pill"
                  className="storefront-header__nav-pill"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <span className="storefront-header__nav-label">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </>
  );
}

export function StorefrontLayout() {
  const { itemCount, openCart } = useCart();
  const location = useLocation();

  // Bajo ~640px los 5 links de nav + el botón de carrito no cabían y se
  // desbordaban del header, por eso se necesita un menú móvil real.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Un cambio de ruta siempre cierra el menú móvil y regresa el scroll al
  // inicio (React Router no lo hace por sí solo). Se usa solo pathname (no
  // toda la location), así que cambiar un query string de filtro no
  // resetea el scroll, solo un cambio de página real lo hace.
  useEffect(() => {
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [location.pathname]);

  // El menú ahora es pantalla completa, por eso necesita bloquear el scroll.
  useScrollLock(mobileMenuOpen);

  // Vista previa pequeña del mapa en el footer. PublicBranch no tiene
  // concepto de "sucursal principal", así que se usa branches[0].
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
            <StorefrontNavLinks />
          </nav>
          <div className="storefront-header__actions">
            <button type="button" className="storefront-header__cart" onClick={openCart} aria-label="Abrir carrito">
              <ShoppingBag size={18} aria-hidden="true" />
              <span className="storefront-header__cart-label">Carrito</span>
              {/* Keyed by itemCount so every change (not just 0→1) replays
                  the pop-in — a satisfying little "yes, that landed" beat
                  every time something is added or removed, not just once. */}
              <AnimatePresence>
                {itemCount > 0 && (
                  <motion.span
                    key={itemCount}
                    className="storefront-header__cart-badge"
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                  >
                    {itemCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
            <button
              type="button"
              className="storefront-header__menu-toggle"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label={mobileMenuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen &&
          createPortal(
            /* Se renderiza vía portal directo a <body> (igual que
               CartDrawer.tsx/Modal.tsx): .storefront-header tiene su propio
               backdrop-filter, que crea un containing block nuevo para los
               descendientes `position: fixed`, haciendo que el overlay
               quedara aplastado en la altura del header en vez de cubrir
               toda la página. El portal escapa de ese ancestro. */
            // El efecto que cierra el menú al cambiar de ruta (más arriba)
            // no dispara si el usuario toca el link de la página en la que
            // ya está (pathname no cambia) — se agrega onClick aquí para
            // cerrarlo siempre, sin depender solo del cambio de ruta.
            <nav className="storefront-header__mobile-nav" aria-label="Navegación principal (móvil)">
              <NavLink to="/" end onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "is-active" : undefined)}>
                Inicio
              </NavLink>
              <NavLink to="/catalogo" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "is-active" : undefined)}>
                Catálogo
              </NavLink>
              <NavLink to="/nosotros" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "is-active" : undefined)}>
                Nosotros
              </NavLink>
              <NavLink to="/preguntas-frecuentes" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "is-active" : undefined)}>
                FAQ
              </NavLink>
              <NavLink to="/ubicacion" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => (isActive ? "is-active" : undefined)}>
                Ubicación
              </NavLink>
            </nav>,
            document.body
          )}
      </header>

      <main className="storefront-main">
        <Outlet />
      </main>

      <footer className="storefront-footer">
        <div className="storefront-footer__inner">
          <div className="storefront-footer__col storefront-footer__col--rating">
            {/* Anonymous "¿qué tal tu experiencia?" widget — visible on every
                storefront page since the footer is shared, so a visitor can
                leave feedback wherever they happen to be. `page` is the
                current route, sent purely as admin context. */}
            <PeekRating page={location.pathname} />
          </div>

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
