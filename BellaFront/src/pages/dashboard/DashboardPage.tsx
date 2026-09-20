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
  SprayCan,
  Sparkles,
  Flower2,
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

// Sets the two CSS custom properties an orbiting icon's wrapper/keyframes
// read (--orbit-radius, --orbit-duration) plus a real animation-delay, so
// each icon can start mid-cycle at a different point on its circle instead
// of every orbit visibly "launching" from the same angle on page load.
// Same `as unknown as CSSProperties` escape hatch as staggerStyle above —
// custom properties aren't part of csstype's CSSProperties.
function orbitStyle(radiusPx: number, durationS: number, delayS = 0): CSSProperties {
  return {
    "--orbit-radius": `${radiusPx}px`,
    "--orbit-duration": `${durationS}s`,
    animationDelay: `${delayS}s`,
  } as unknown as CSSProperties;
}

// Hero visual, pushed further than the previous "beauty retail" pass
// (spray-can centerpiece + two icons bobbing in place) into something that
// actually reads as *moving*: three lucide glyphs genuinely orbit the
// centerpiece along circular paths at three different radii, speeds, and
// directions (Flower2 tight and fast, Gem tighter still and quickest,
// Sparkles wide, slow, and counter-rotating), each icon kept upright the
// whole way around by counter-spinning at the same rate its orbit sweeps —
// the classic two-layer "orbit wrapper rotates, icon cancels the rotation"
// CSS trick, not a bob/pulse. Sparkles also gets its own independent
// twinkle (opacity) animation layered on top, since `transform` and
// `opacity` don't conflict — one icon that's simultaneously orbiting AND
// twinkling, so the whole composition doesn't move in lockstep. Centerpiece
// keeps its glow/ring/shimmer/gentle-bob treatment underneath. Pure CSS,
// no canvas/WebGL/animation library; every motion uses `animation`, so the
// existing sitewide `prefers-reduced-motion` rule in global.css freezes
// all of it automatically.
function DashboardVisual() {
  return (
    <div className="dashboard-visual" aria-hidden="true">
      <span className="dashboard-visual__glow" />
      <span className="dashboard-visual__ring" />
      <span className="dashboard-visual__centerpiece">
        <SprayCan size={30} strokeWidth={1.5} />
        <span className="dashboard-visual__shimmer" />
      </span>

      <span className="dashboard-visual__orbit" style={orbitStyle(34, 10)}>
        <Flower2 className="dashboard-visual__orbit-icon dashboard-visual__orbit-icon--flower" size={14} strokeWidth={1.75} />
      </span>
      <span className="dashboard-visual__orbit dashboard-visual__orbit--reverse" style={orbitStyle(46, 16, -5)}>
        <Sparkles className="dashboard-visual__orbit-icon dashboard-visual__orbit-icon--sparkle" size={13} strokeWidth={1.75} />
      </span>
      <span className="dashboard-visual__orbit" style={orbitStyle(24, 7, -2)}>
        <Gem className="dashboard-visual__orbit-icon dashboard-visual__orbit-icon--gem" size={11} strokeWidth={1.75} />
      </span>
    </div>
  );
}

// Real-data-only chart pair replacing a fabricated "best sellers" widget
// (no sales/orders data exists anywhere in the system yet — see the
// project's own standing instruction never to invent that panel). Both
// draw from data the dashboard already fetches for other purposes:
// inventory rows (full distribution, not just the low-stock subset) and
// users x branches (already-loaded arrays, no new endpoint).

const ALL_STATUS_LABEL: Record<string, string> = { AVAILABLE: "Disponible", LOW: "Bajo", CRITICAL: "Crítico", OUT: "Agotado" };
const ALL_STATUS_ORDER = ["OUT", "CRITICAL", "LOW", "AVAILABLE"] as const;
const STATUS_COLOR: Record<string, string> = {
  OUT: "#B3261E",
  CRITICAL: "#C05621",
  LOW: "var(--color-pink-deep)",
  AVAILABLE: "var(--color-accent)",
};

// A CSS conic-gradient ring (no charting library, no SVG path math) —
// custom properties resolve fine inside conic-gradient() in every modern
// browser, so the existing design tokens can be reused directly as stops.
function InventoryStatusDonut({ counts, total }: { counts: Record<string, number>; total: number }) {
  if (total === 0) {
    return <StatusState kind="empty" compact message="Aún no hay inventario registrado." />;
  }
  let cursor = 0;
  const stops: string[] = [];
  ALL_STATUS_ORDER.forEach((status) => {
    const count = counts[status] ?? 0;
    if (count === 0) return;
    const start = (cursor / total) * 360;
    cursor += count;
    const end = (cursor / total) * 360;
    stops.push(`${STATUS_COLOR[status]} ${start}deg ${end}deg`);
  });
  return (
    <div className="inventory-donut">
      <div className="inventory-donut__ring" style={{ background: `conic-gradient(${stops.join(", ")})` }}>
        <div className="inventory-donut__hole">
          <span className="inventory-donut__total">{total}</span>
          <span className="inventory-donut__total-label">SKUs</span>
        </div>
      </div>
      <ul className="inventory-donut__legend">
        {ALL_STATUS_ORDER.filter((status) => (counts[status] ?? 0) > 0).map((status) => (
          <li key={status}>
            <span className="inventory-donut__dot" style={{ background: STATUS_COLOR[status] }} />
            <span className="inventory-donut__legend-label">{ALL_STATUS_LABEL[status]}</span>
            <strong>{counts[status]}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface BranchUserCount { id: string; name: string; count: number; }

function BranchUsersBar({ data }: { data: BranchUserCount[] }) {
  if (data.length === 0) {
    return <StatusState kind="empty" compact message="No hay sucursales registradas." />;
  }
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <ul className="branch-bar-chart">
      {data.map((d, i) => (
        <li key={d.id} className="branch-bar-chart__row animate-in-stagger" style={staggerStyle(i * 50)}>
          <span className="branch-bar-chart__label" title={d.name}>{d.name}</span>
          <div className="branch-bar-chart__track">
            <div className="branch-bar-chart__fill" style={{ width: `${(d.count / max) * 100}%` }} />
          </div>
          <span className="branch-bar-chart__value">{d.count}</span>
        </li>
      ))}
    </ul>
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
  const lowStockVisible = lowStockRows.slice(0, 5);

  const inventoryCounts = (inventory ?? []).reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  const inventoryTotal = inventory?.length ?? 0;

  const branchUserCounts: BranchUserCount[] = (branches ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    count: (users ?? []).filter((u) => u.status === "ACTIVE" && (u.allBranches || u.branches.some((ub) => ub.id === b.id))).length,
  }));

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
          {/* Full icon+wordmark lockup — the fuller brand mark that, until
              now, only ever appeared pre-cropped as the sidebar's small
              monogram. Small and quiet on purpose (a subtle brand touch
              above the existing visual/avatar row, not a second hero) —
              the greeting text block to the left is untouched. */}
          <img
            src="/brand/logo-full-240.png"
            alt="Bella Makeup"
            className="dashboard-hero__brandmark"
          />
          <div className="dashboard-hero__visual-row">
            <DashboardVisual />
            {user && (
              <div className="dashboard-hero__avatar">
                <Avatar avatarStyle={user.avatarStyle} avatarSeed={user.avatarSeed} displayName={user.displayName} size="lg" />
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="dashboard-body">
        <div className="dashboard-body__charts">
        <PermissionGate code="inventory.view">
          <section className="dashboard-panel dashboard-panel--stock animate-in" style={{ animationDelay: "180ms" }}>
            <header className="dashboard-panel__header">
              <div className="dashboard-panel__title">
                <PackageSearch size={17} />
                <h2>Inventario por estado</h2>
              </div>
            </header>

            {inventoryStatus === "loading" && <StatusState kind="loading" />}
            {inventoryStatus === "error" && <StatusState kind="error" message="No se pudo cargar el inventario." />}
            {inventoryStatus === "ready" && <InventoryStatusDonut counts={inventoryCounts} total={inventoryTotal} />}

            {inventoryStatus === "ready" && lowStockRows.length > 0 && (
              <>
                <p className="dashboard-panel__subheading">Con menor existencia</p>
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
            {inventoryStatus === "ready" && inventoryTotal > 0 && lowStockRows.length === 0 && (
              <p className="dashboard-panel__subheading dashboard-panel__subheading--ok">Todo el inventario está en niveles saludables.</p>
            )}
          </section>
        </PermissionGate>

        {(canViewBranches || canViewUsers) && (
          <section className="dashboard-panel dashboard-panel--branches animate-in" style={{ animationDelay: "220ms" }}>
            <header className="dashboard-panel__header">
              <div className="dashboard-panel__title">
                <Users size={17} />
                <h2>Usuarios por sucursal</h2>
              </div>
            </header>
            {(branchesStatus === "loading" || usersStatus === "loading") && <StatusState kind="loading" />}
            {(branchesStatus === "error" || usersStatus === "error") && <StatusState kind="error" message="No se pudieron cargar los datos." />}
            {branchesStatus === "ready" && usersStatus === "ready" && <BranchUsersBar data={branchUserCounts} />}
          </section>
        )}
        </div>

        <section className="dashboard-panel dashboard-panel--links dashboard-panel--gradient animate-in" style={{ animationDelay: "260ms" }}>
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
    </div>
  );
}
