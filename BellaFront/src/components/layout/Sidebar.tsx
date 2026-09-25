import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Settings,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PackageSearch,
  Package,
  ShoppingCart,
  ShoppingBag,
  Receipt,
  Wallet,
  PackageX,
  ClipboardList,
  PackageOpen,
  Menu,
  X,
} from "lucide-react";
import { PermissionGate } from "../auth/PermissionGate";
import "./Sidebar.css";

const STORAGE_KEY = "bellafront:sidebar-collapsed";

const linkClass = ({ isActive }: { isActive: boolean }) => `sidebar__link${isActive ? " sidebar__link--active" : ""}`;

// Usuarios y Roles ya no tienen entrada propia: viven como pestañas dentro
// de Configuración (ver SettingsPage.tsx). Cada ítem declara un solo
// `permission` o una lista `anyOf`, nunca ambos.
//
// Transferencias tampoco tiene entrada propia: se accede desde el botón
// "Transferencias" en la página de Productos, igual que Proveedores se
// accede desde Compras. La ruta (/admin/transferencias) sigue existiendo
// y protegida en router.tsx, solo se quitó el enlace redundante del sidebar.
const NAV_ITEMS = [
  { to: "/admin", end: true, label: "Inicio", icon: LayoutDashboard, permission: null, anyOf: null },
  { to: "/admin/sucursales", end: false, label: "Sucursales", icon: Building2, permission: "branches.view", anyOf: null },
  { to: "/admin/productos", end: false, label: "Productos", icon: Package, permission: "products.view", anyOf: null },
  { to: "/admin/inventario", end: false, label: "Inventario", icon: PackageSearch, permission: "inventory.view", anyOf: null },
  { to: "/admin/inventarios-fisicos", end: false, label: "Inventarios físicos", icon: ClipboardList, permission: "inventory.count", anyOf: null },
  // Agrupado con Inventario en vez de con Ventas: comprar es una operación
  // afín al inventario. Proveedores no tiene entrada propia a propósito,
  // es dato secundario y se accede desde Compras.
  { to: "/admin/compras", end: false, label: "Compras", icon: ShoppingBag, permission: "purchases.view", anyOf: null },
  { to: "/admin/pos", end: false, label: "Punto de venta", icon: ShoppingCart, permission: "sales.create", anyOf: null },
  { to: "/admin/ventas", end: false, label: "Ventas", icon: Receipt, permission: "sales.view", anyOf: null },
  { to: "/admin/pedidos", end: false, label: "Pedidos", icon: PackageOpen, permission: "orders.view", anyOf: null },
  // Un cajero abre/cierra su propio corte; un gerente solo audita turnos
  // ajenos — cualquiera de los dos permisos basta, igual que en router.tsx.
  { to: "/admin/caja", end: false, label: "Caja", icon: Wallet, permission: null, anyOf: ["cash.manage", "cash.audit"] },
  { to: "/admin/mermas", end: false, label: "Mermas", icon: PackageX, permission: "shrinkage.view", anyOf: null },
  { to: "/admin/mensajes", end: false, label: "Mensajes", icon: MessagesSquare, permission: "messages.view", anyOf: null },
  // Sin gate de permisos: todo usuario autenticado siempre tiene la pestaña
  // "Mi perfil" dentro de Configuración, así que el enlace siempre es
  // accesible, igual que en router.tsx (sin PermissionRoute en esta ruta).
  { to: "/admin/configuracion", end: false, label: "Configuración", icon: Settings, permission: null, anyOf: null },
] as const;

function readStoredCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState<boolean>(readStoredCollapsed);
  // Bajo 768px se muestra una barra delgada con botón de hamburguesa que
  // abre el menú completo como un drawer, en vez de una fila horizontal
  // con scroll que ocultaba la mayoría de los ítems sin indicarlo.
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // localStorage no disponible (modo privado/deshabilitado): la
      // preferencia no persiste al recargar, no es un error grave.
    }
  }, [collapsed]);

  // Cualquier navegación (incluso un tap dentro del propio drawer) lo cierra.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const activeItem = NAV_ITEMS.find((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)
  );

  const navList = (
    <nav className="sidebar__nav">
      {NAV_ITEMS.map(({ to, end, label, icon: Icon, permission, anyOf }) => {
        const link = (
          <NavLink key={to} to={to} end={end} className={linkClass} data-tooltip={label}>
            <span className="sidebar__link-icon">
              <Icon size={19} />
            </span>
            <span className="sidebar__link-label">{label}</span>
          </NavLink>
        );
        if (permission) return <PermissionGate key={to} code={permission}>{link}</PermissionGate>;
        if (anyOf) return <PermissionGate key={to} anyOf={[...anyOf]}>{link}</PermissionGate>;
        return link;
      })}
    </nav>
  );

  return (
    <>
      {/* Barra delgada solo para móvil (oculta ≥769px vía CSS): nombre de
          la sección actual + botón de hamburguesa. */}
      <div className="sidebar__mobile-bar">
        <button
          type="button"
          className="sidebar__mobile-trigger"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú"
          aria-expanded={mobileOpen}
        >
          <Menu size={20} />
        </button>
        <span className="sidebar__mobile-current">{activeItem?.label ?? "Menú"}</span>
      </div>

      {mobileOpen && (
        <div className="sidebar__mobile-overlay" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}

      <aside className={`sidebar${collapsed ? " sidebar--collapsed" : ""}${mobileOpen ? " sidebar--mobile-open" : ""}`}>
        <div className="sidebar__glow" aria-hidden="true" />
        <div className="sidebar__grid" aria-hidden="true" />

        <div className="sidebar__brand">
          {collapsed ? (
            <img src="/brand/monogram-transparent.png" alt="Bella Makeup" className="sidebar__brand-logo" />
          ) : (
            <img src="/brand/logo-full-480.png" alt="Bella Makeup" className="sidebar__brand-lockup" />
          )}
          <button
            type="button"
            className="sidebar__mobile-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        </div>

        {navList}

        <div className="sidebar__footer">
          <button
            type="button"
            className="sidebar__toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-pressed={collapsed}
            aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
            data-tooltip={collapsed ? "Expandir" : "Colapsar"}
          >
            <span className="sidebar__link-icon">
              {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            </span>
            <span className="sidebar__link-label">Colapsar</span>
          </button>
        </div>
      </aside>
    </>
  );
}
