import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  ShieldCheck,
  Building2,
  Settings,
  ScrollText,
  PanelLeftClose,
  PanelLeftOpen,
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
  { to: "/auditoria", end: false, label: "Actividad reciente", icon: ScrollText, permission: "audit.view" },
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
        <span className="sidebar__brand-mark">B</span>
        <span className="sidebar__brand-text">Bella Makeup</span>
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
        data-tooltip={collapsed ? "Expandir" : "Colapsar"}
      >
        <span className="sidebar__link-icon">
          {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
        </span>
      </button>
    </aside>
  );
}
