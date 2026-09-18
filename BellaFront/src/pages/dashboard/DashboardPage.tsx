import { useEffect, useState, type ComponentType, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  Users,
  ShieldCheck,
  ScrollText,
  Settings,
  UserRound,
  ArrowUpRight,
  PackageSearch,
  Droplet,
  Sparkles,
  Gem,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { usePermission } from "../../hooks/usePermission";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { Avatar } from "../../components/common/Avatar";
import { StatusState } from "../../components/common/StatusState";
import * as branchService from "../../services/branchService";
import * as userService from "../../services/userService";
import * as roleService from "../../services/roleService";
import * as inventoryService from "../../services/inventoryService";
import type { Branch, InventoryRow, Role, User } from "../../types/api";
import "./DashboardPage.css";

type FetchStatus = "idle" | "loading" | "ready" | "error";

// Time-of-day-aware, casual-but-elegant greeting copy — replaces the old
// generic "Buenas tardes, {name}" that ran regardless of how late/early it
// actually was. Four bands instead of the previous three so genuine late-
// night use ("Trabajando de noche...") reads differently from a normal
// evening shift.
function getGreeting(hour: number, name: string): { title: string; subtitle: string } {
  if (hour < 5) return { title: `Trabajando de madrugada, ${name}`, subtitle: "Que rindas y descanses pronto." };
  if (hour < 12) return { title: `Buenos días, ${name}`, subtitle: "Que tengas una jornada ligera." };
  if (hour < 18) return { title: `Buenas tardes, ${name}`, subtitle: "Vamos con buen ritmo hoy." };
  if (hour < 22) return { title: `Buenas noches, ${name}`, subtitle: "Cerrando el día con calma." };
  return { title: `Trabajando de noche, ${name}`, subtitle: "Que pases buena noche." };
}

const today = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

// The `--stagger-delay` custom property (consumed by .animate-in-stagger in
// global.css) isn't part of csstype's CSSProperties, so it needs an escape
// hatch through `unknown` rather than a direct assertion.
function staggerStyle(ms: number): CSSProperties {
  return { "--stagger-delay": `${ms}ms` } as unknown as CSSProperties;
}

// A small, self-contained CSS/SVG-layered "abstract beauty" visual for the
// hero — three softly blurred gradient orbs drifting at different speeds
// (parallax-style depth from layering + blur, not literal 3D geometry),
// a slow-rotating ring, and two lucide glyphs (a serum droplet as the
// centerpiece, a twinkle accent) with drop-shadows for lift. No new
// dependency, no canvas/WebGL — every animation here uses `animation`/
// `transition`, so the existing sitewide `prefers-reduced-motion` rule in
// global.css automatically freezes it for users who need that.
function DashboardVisual() {
  return (
    <div className="dashboard-visual" aria-hidden="true">
      <span className="dashboard-visual__orb dashboard-visual__orb--a" />
      <span className="dashboard-visual__orb dashboard-visual__orb--b" />
      <span className="dashboard-visual__orb dashboard-visual__orb--c" />
      <span className="dashboard-visual__ring" />
      <Gem className="dashboard-visual__icon dashboard-visual__icon--gem" size={16} strokeWidth={1.75} />
      <Droplet className="dashboard-visual__icon dashboard-visual__icon--droplet" size={34} strokeWidth={1.5} />
      <Sparkles className="dashboard-visual__icon dashboard-visual__icon--sparkle" size={18} strokeWidth={1.75} />
    </div>
  );
}

interface StatCardProps {
  icon: ComponentType<{ size?: number }>;
  label: string;
  value: number | null;
  caption?: string;
  status: FetchStatus;
  errorMessage: string;
  delay: number;
}

function StatCard({ icon: Icon, label, value, caption, status, errorMessage, delay }: StatCardProps) {
  return (
    <article className="stat-card animate-in-stagger" style={staggerStyle(delay)}>
      <div className="stat-card__icon"><Icon size={20} /></div>
      <div className="stat-card__body">
        <p className="stat-card__label">{label}</p>
        {status === "loading" && <StatusState kind="loading" compact message="Calculando..." />}
        {status === "error" && <StatusState kind="error" compact message={errorMessage} />}
        {status === "ready" && (
          <>
            <p className="stat-card__value">{value?.toLocaleString("es-MX") ?? 0}</p>
            {caption && <p className="stat-card__caption">{caption}</p>}
          </>
        )}
      </div>
    </article>
  );
}

interface QuickLink {
  to: string;
  label: string;
  description: string;
  icon: ComponentType<{ size?: number }>;
  permission: string | null;
}

const QUICK_LINKS: QuickLink[] = [
  { to: "/usuarios", label: "Usuarios", description: "Gestiona cuentas y roles del equipo", icon: Users, permission: "users.view" },
  { to: "/sucursales", label: "Sucursales", description: "Consulta y edita puntos de venta", icon: Building2, permission: "branches.view" },
  { to: "/roles", label: "Roles", description: "Permisos y accesos por rol", icon: ShieldCheck, permission: "roles.view" },
  { to: "/auditoria", label: "Actividad reciente", description: "Historial completo de actividad", icon: ScrollText, permission: "audit.view" },
  { to: "/configuracion", label: "Configuración", description: "Datos generales de la empresa", icon: Settings, permission: "settings.manage" },
  { to: "/perfil", label: "Mi perfil", description: "Tus datos y preferencias", icon: UserRound, permission: null },
];

const STOCK_STATUS_LABEL: Record<string, string> = { LOW: "Bajo", CRITICAL: "Crítico", OUT: "Agotado" };
const STOCK_STATUS_ORDER: Record<string, number> = { OUT: 0, CRITICAL: 1, LOW: 2 };

export function DashboardPage() {
  const { user } = useAuth();

  const canViewBranches = usePermission("branches.view");
  const canViewUsers = usePermission("users.view");
  const canViewRoles = usePermission("roles.view");
  const canViewInventory = usePermission("inventory.view");

  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [branchesStatus, setBranchesStatus] = useState<FetchStatus>(canViewBranches ? "loading" : "idle");

  const [users, setUsers] = useState<User[] | null>(null);
  const [usersStatus, setUsersStatus] = useState<FetchStatus>(canViewUsers ? "loading" : "idle");

  const [roles, setRoles] = useState<Role[] | null>(null);
  const [rolesStatus, setRolesStatus] = useState<FetchStatus>(canViewRoles ? "loading" : "idle");

  const [inventory, setInventory] = useState<InventoryRow[] | null>(null);
  const [inventoryStatus, setInventoryStatus] = useState<FetchStatus>(canViewInventory ? "loading" : "idle");

  useEffect(() => {
    if (!canViewBranches) return;
    branchService
      .listBranches()
      .then((b) => { setBranches(b); setBranchesStatus("ready"); })
      .catch(() => setBranchesStatus("error"));
  }, [canViewBranches]);

  useEffect(() => {
    if (!canViewUsers) return;
    userService
      .listUsers()
      .then((u) => { setUsers(u); setUsersStatus("ready"); })
      .catch(() => setUsersStatus("error"));
  }, [canViewUsers]);

  useEffect(() => {
    if (!canViewRoles) return;
    roleService
      .listRoles()
      .then((r) => { setRoles(r); setRolesStatus("ready"); })
      .catch(() => setRolesStatus("error"));
  }, [canViewRoles]);

  useEffect(() => {
    if (!canViewInventory) return;
    inventoryService
      .listInventory()
      .then((rows) => { setInventory(rows); setInventoryStatus("ready"); })
      .catch(() => setInventoryStatus("error"));
  }, [canViewInventory]);

  const activeBranches = branches?.filter((b) => b.status === "ACTIVE").length ?? null;
  const activeUsers = users?.filter((u) => u.status === "ACTIVE").length ?? null;
  const rolesInUse = roles?.filter((r) => r.assignedUsersCount > 0).length ?? null;

  const hasAnyStat = canViewBranches || canViewUsers || canViewRoles;
  const visibleQuickLinks = QUICK_LINKS; // permission gating happens per-item via PermissionGate

  const lowStockRows = (inventory ?? [])
    .filter((row) => row.status === "LOW" || row.status === "CRITICAL" || row.status === "OUT")
    .sort((a, b) => STOCK_STATUS_ORDER[a.status] - STOCK_STATUS_ORDER[b.status] || a.stock - b.stock);
  const lowStockCounts = {
    OUT: lowStockRows.filter((r) => r.status === "OUT").length,
    CRITICAL: lowStockRows.filter((r) => r.status === "CRITICAL").length,
    LOW: lowStockRows.filter((r) => r.status === "LOW").length,
  };
  const lowStockVisible = lowStockRows.slice(0, 6);

  const hour = new Date().getHours();
  const greeting = getGreeting(hour, user?.displayName ?? "de nuevo");

  return (
    <div className="dashboard-page">
      <header className="dashboard-hero animate-in">
        <div className="dashboard-hero__text">
          <p className="dashboard-hero__eyebrow">{today}</p>
          <h1 className="dashboard-hero__title">{greeting.title}</h1>
          <p className="dashboard-hero__subtitle">{greeting.subtitle}</p>
          {user && (
            <p className="dashboard-hero__meta">
              {user.role.name}
              {user.allBranches ? " · Acceso a todas las sucursales" : ""}
            </p>
          )}
        </div>
        <div className="dashboard-hero__side">
          <DashboardVisual />
          {user && (
            <div className="dashboard-hero__avatar">
              <Avatar avatarStyle={user.avatarStyle} avatarSeed={user.avatarSeed} displayName={user.displayName} size="lg" />
            </div>
          )}
        </div>
      </header>

      {hasAnyStat && (
        <section className="stat-grid">
          <PermissionGate code="branches.view">
            <StatCard
              icon={Building2}
              label="Sucursales activas"
              value={activeBranches}
              caption={branches ? `de ${branches.length} en total` : undefined}
              status={branchesStatus}
              errorMessage="No se pudo cargar"
              delay={0}
            />
          </PermissionGate>
          <PermissionGate code="users.view">
            <StatCard
              icon={Users}
              label="Usuarios activos"
              value={activeUsers}
              caption={users ? `de ${users.length} en total` : undefined}
              status={usersStatus}
              errorMessage="No se pudo cargar"
              delay={70}
            />
          </PermissionGate>
          <PermissionGate code="roles.view">
            <StatCard
              icon={ShieldCheck}
              label="Roles en uso"
              value={rolesInUse}
              caption={roles ? `de ${roles.length} roles definidos` : undefined}
              status={rolesStatus}
              errorMessage="No se pudo cargar"
              delay={140}
            />
          </PermissionGate>
        </section>
      )}

      <div className="dashboard-body">
        <PermissionGate code="inventory.view">
          <section className="dashboard-panel dashboard-panel--stock animate-in" style={{ animationDelay: "180ms" }}>
            <header className="dashboard-panel__header">
              <div className="dashboard-panel__title">
                <PackageSearch size={17} />
                <h2>Inventario bajo</h2>
              </div>
            </header>

            {inventoryStatus === "loading" && <StatusState kind="loading" />}
            {inventoryStatus === "error" && <StatusState kind="error" message="No se pudo cargar el inventario." />}
            {inventoryStatus === "ready" && lowStockRows.length === 0 && (
              <StatusState kind="empty" message="Todo el inventario está en niveles saludables." />
            )}
            {inventoryStatus === "ready" && lowStockRows.length > 0 && (
              <>
                <div className="stock-summary">
                  <span className="stock-chip stock-chip--out">{lowStockCounts.OUT} agotado{lowStockCounts.OUT === 1 ? "" : "s"}</span>
                  <span className="stock-chip stock-chip--critical">{lowStockCounts.CRITICAL} crítico{lowStockCounts.CRITICAL === 1 ? "" : "s"}</span>
                  <span className="stock-chip stock-chip--low">{lowStockCounts.LOW} bajo{lowStockCounts.LOW === 1 ? "" : "s"}</span>
                </div>
                <ul className="stock-list">
                  {lowStockVisible.map((row, i) => (
                    <li key={row.id} className="stock-item animate-in-stagger" style={staggerStyle(Math.min(i, 8) * 40)}>
                      <div className="stock-item__body">
                        <p className="stock-item__name">{row.product.name}{row.variant ? ` · ${row.variant.name}` : ""}</p>
                        <p className="stock-item__branch">{row.branch.name}</p>
                      </div>
                      <span className={`stock-badge stock-badge--${row.status.toLowerCase()}`}>
                        {STOCK_STATUS_LABEL[row.status]} · {row.stock}
                      </span>
                    </li>
                  ))}
                </ul>
                {lowStockRows.length > lowStockVisible.length && (
                  <p className="stock-list__more">+{lowStockRows.length - lowStockVisible.length} producto{lowStockRows.length - lowStockVisible.length === 1 ? "" : "s"} más con inventario bajo</p>
                )}
              </>
            )}
          </section>
        </PermissionGate>

        <section className="dashboard-panel dashboard-panel--links animate-in" style={{ animationDelay: "220ms" }}>
          <header className="dashboard-panel__header">
            <div className="dashboard-panel__title">
              <h2>Accesos rápidos</h2>
            </div>
          </header>
          <div className="quick-links">
            {visibleQuickLinks.map(({ to, label, description, icon: Icon, permission }, i) => {
              const tile = (
                <Link key={to} to={to} className="quick-link animate-in-stagger" style={staggerStyle(i * 40)}>
                  <span className="quick-link__icon"><Icon size={18} /></span>
                  <span className="quick-link__text">
                    <span className="quick-link__label">{label}</span>
                    <span className="quick-link__description">{description}</span>
                  </span>
                  <ArrowUpRight size={16} className="quick-link__arrow" />
                </Link>
              );
              return permission ? (
                <PermissionGate key={to} code={permission}>
                  {tile}
                </PermissionGate>
              ) : (
                tile
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
