import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Building2,
  Settings,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PackageSearch,
  Package,
  ShoppingCart,
  Receipt,
  ArrowLeftRight,
} from "lucide-react";
import { PermissionGate } from "../auth/PermissionGate";
import "./Sidebar.css";

const STORAGE_KEY = "bellafront:sidebar-collapsed";

const linkClass = ({ isActive }: { isActive: boolean }) => `sidebar__link${isActive ? " sidebar__link--active" : ""}`;

const NAV_ITEMS = [
  { to: "/", end: true, label: "Inicio", icon: LayoutDashboard, permission: null },
  { to: "/usuarios", end: false, label: "Usuarios", icon: Users, permission: "users.view" },
  { to: "/roles", end: false, label: "Roles", icon: ShieldCheck, permission: "roles.view" },
  { to: "/sucursales", end: false, label: "Sucursales", icon: Building2, permission: "branches.view" },
  { to: "/productos", end: false, label: "Productos", icon: Package, permission: "products.view" },
  { to: "/inventario", end: false, label: "Inventario", icon: PackageSearch, permission: "inventory.view" },
  { to: "/transferencias", end: false, label: "Transferencias", icon: ArrowLeftRight, permission: "transfers.view" },
  { to: "/pos", end: false, label: "Punto de venta", icon: ShoppingCart, permission: "sales.create" },
  { to: "/ventas", end: false, label: "Ventas", icon: Receipt, permission: "sales.view" },
  { to: "/mensajes", end: false, label: "Mensajes", icon: MessagesSquare, permission: "messages.view" },
  { to: "/configuracion", end: false, label: "Configuración", icon: Settings, permission: "settings.manage" },
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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // localStorage unavailable (private mode / disabled) — collapse
      // preference just won't survive a reload, non-fatal.
    }
  }, [collapsed]);

  return (
    <aside className={`sidebar${collapsed ? " sidebar--collapsed" : ""}`}>
      <div className="sidebar__glow" aria-hidden="true" />
      <div className="sidebar__grid" aria-hidden="true" />

      <div className="sidebar__brand">
        {collapsed ? (
          <img src="/brand/monogram-transparent.png" alt="Bella Makeup" className="sidebar__brand-logo" />
        ) : (
          <div className="sidebar__brand-card">
            <img src="/brand/logo-full-480.png" alt="Bella Makeup" className="sidebar__brand-lockup" />
          </div>
        )}
      </div>

      <nav className="sidebar__nav">
        {NAV_ITEMS.map(({ to, end, label, icon: Icon, permission }) => {
          const link = (
            <NavLink key={to} to={to} end={end} className={linkClass} data-tooltip={label}>
              <span className="sidebar__link-icon">
                <Icon size={19} />
              </span>
              <span className="sidebar__link-label">{label}</span>
            </NavLink>
          );
          return permission ? (
            <PermissionGate key={to} code={permission}>
              {link}
            </PermissionGate>
          ) : (
            link
          );
        })}
      </nav>

      <button
        type="button"
        className="sidebar__toggle"
        onClick={() => setCollapsed((c) => !c)}
        aria-pressed={collapsed}
        aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
      >
        {collapsed ? <PanelLeftOpen size={22} /> : <PanelLeftClose size={22} />}
      </button>
    </aside>
  );
}
