import { useEffect, useState, type ComponentType } from "react";
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
  TrendingUp,
  Sparkles,
  Unlock,
  AlertTriangle,
  Star,
} from "lucide-react";
import { staggerStyle } from "../../utils/staggerStyle";
import { useAuth } from "../../hooks/useAuth";
import { usePermission } from "../../hooks/usePermission";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { Avatar } from "../../components/common/Avatar";
import { StatusState } from "../../components/common/StatusState";
import { RevealWords } from "../../components/common/RevealWords";
import * as branchService from "../../services/branchService";
import * as userService from "../../services/userService";
import * as roleService from "../../services/roleService";
import * as inventoryService from "../../services/inventoryService";
import * as saleService from "../../services/saleService";
import * as cashSessionService from "../../services/cashSessionService";
import * as ratingService from "../../services/ratingService";
import type { RatingSummary } from "../../services/ratingService";
import type { Branch, CashSession, InventoryRow, Role, Sale, User } from "../../types/api";
import "./DashboardPage.css";

import { compactCurrencyFormatter as currencyFormatter } from "../../utils/currency";
import { INVENTORY_STATUS_LABEL } from "../../utils/inventoryStatus";

type FetchStatus = "idle" | "loading" | "ready" | "error";

// Saludo según la hora del día, con cuatro franjas (no tres) para
// diferenciar el turno nocturno genuino de una tarde normal.
function getGreeting(hour: number, name: string): { title: string; subtitle: string } {
  if (hour < 5) return { title: `Trabajando de madrugada, ${name}`, subtitle: "Que rindas y descanses pronto." };
  if (hour < 12) return { title: `Buenos días, ${name}`, subtitle: "Que tengas una jornada ligera." };
  if (hour < 18) return { title: `Buenas tardes, ${name}`, subtitle: "Vamos con buen ritmo hoy." };
  if (hour < 22) return { title: `Buenas noches, ${name}`, subtitle: "Cerrando el día con calma." };
  return { title: `Trabajando de noche, ${name}`, subtitle: "Que pases buena noche." };
}

const today = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

// Visual del hero: un mini tocador con un labial y un frasco de sérum sobre
// un pódium espejado giratorio, con destellos flotando alrededor. Construido
// enteramente con CSS (sin íconos, SVG ni imágenes): cada producto es una
// pila de cilindros con degradados oscuro-especular-oscuro para simular
// volumen metálico/vidrio.
//
// El 3D es real (no una ilusión 2D): `.dashboard-visual` define la
// `perspective`, `.dashboard-visual__stage` usa `transform-style:
// preserve-3d` con rotateX/rotateY, y cada producto tiene su propio
// `translateZ` para crear paralaje al girar.
//
// Los colores salen de la rampa de tokens azul existente vía color-mix()
// (los nombres pink-* son azules por una particularidad histórica del
// código). Toda la animación corre por `animation`, así que la regla global
// prefers-reduced-motion congela la escena; cada elemento también lleva un
// `transform` estático igual a su keyframe 0% para no colapsar sin animación.
function DashboardVisual() {
  return (
    <div className="dashboard-visual" aria-hidden="true">
      <div className="dashboard-visual__stage">
        <span className="dashboard-visual__podium" />

        <div className="dashboard-visual__serum">
          <span className="dashboard-visual__serum-body" />
          <span className="dashboard-visual__serum-shoulder" />
          <span className="dashboard-visual__serum-neck" />
          <span className="dashboard-visual__serum-cap" />
        </div>

        <div className="dashboard-visual__lipstick">
          <span className="dashboard-visual__lip-bullet" />
          <span className="dashboard-visual__lip-tip" />
          <span className="dashboard-visual__lip-barrel" />
          <span className="dashboard-visual__lip-collar" />
        </div>

        <span className="dashboard-visual__sparkle dashboard-visual__sparkle--1" />
        <span className="dashboard-visual__sparkle dashboard-visual__sparkle--2" />
        <span className="dashboard-visual__sparkle dashboard-visual__sparkle--3" />
      </div>
    </div>
  );
}

// Par de gráficas con datos reales únicamente (nunca inventar un panel de
// "más vendidos" sin datos reales de ventas). Ambas reutilizan datos que el
// dashboard ya obtiene para otros fines: filas de inventario y usuarios x sucursales.

const ALL_STATUS_ORDER = ["OUT", "CRITICAL", "LOW", "AVAILABLE"] as const;
const STATUS_COLOR: Record<string, string> = {
  OUT: "#B3261E",
  CRITICAL: "#C05621",
  LOW: "var(--color-pink-deep)",
  AVAILABLE: "var(--color-accent)",
};

// Anillo con conic-gradient en CSS puro (sin librería de gráficas ni SVG),
// reutilizando los tokens de diseño existentes como stops del gradiente.
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
            <span className="inventory-donut__legend-label">{INVENTORY_STATUS_LABEL[status]}</span>
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

// ---------- Gráficas basadas en ventas ----------
// Solo datos reales: ambas gráficas vienen del mismo fetch de ventas de 30
// días. Cada una es una serie única, por eso usan un solo color de acento
// en vez de una paleta categórica.

interface DayTotal { key: string; label: string; total: number; }

function SalesTrendChart({ days }: { days: DayTotal[] }) {
  if (days.every((d) => d.total === 0)) {
    return <StatusState kind="empty" compact message="Sin ventas registradas en los últimos 7 días." />;
  }
  const max = Math.max(...days.map((d) => d.total), 1);
  return (
    <div className="sales-trend-chart">
      <ul className="sales-trend-chart__bars">
        {days.map((d, i) => (
          <li key={d.key} className="sales-trend-chart__col animate-in-stagger" style={staggerStyle(i * 50)}>
            <span className="sales-trend-chart__value">{d.total > 0 ? currencyFormatter.format(d.total) : ""}</span>
            <div className="sales-trend-chart__track" title={`${d.label}: ${currencyFormatter.format(d.total)}`}>
              <div className="sales-trend-chart__fill" style={{ height: `${Math.max((d.total / max) * 100, d.total > 0 ? 6 : 0)}%` }} />
            </div>
            <span className="sales-trend-chart__label">{d.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface ProductQty { key: string; name: string; qty: number; }

function TopProductsBar({ data }: { data: ProductQty[] }) {
  if (data.length === 0) {
    return <StatusState kind="empty" compact message="Sin ventas registradas en los últimos 30 días." />;
  }
  const max = Math.max(...data.map((d) => d.qty), 1);
  return (
    <ul className="top-products-chart">
      {data.map((d, i) => (
        <li key={d.key} className="top-products-chart__row animate-in-stagger" style={staggerStyle(i * 50)}>
          <span className="top-products-chart__label" title={d.name}>{d.name}</span>
          <div className="top-products-chart__track">
            <div className="top-products-chart__fill" style={{ width: `${(d.qty / max) * 100}%` }} />
          </div>
          <span className="top-products-chart__value">{d.qty}</span>
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
  // Usuarios/Roles ahora viven como pestañas dentro de Configuración: se
  // enlaza directo a su pestaña en vez de a las antiguas páginas separadas.
  { to: "/admin/configuracion?tab=usuarios", label: "Usuarios", description: "Gestiona cuentas y roles del equipo", icon: Users, permission: "users.view" },
  { to: "/admin/sucursales", label: "Sucursales", description: "Consulta y edita puntos de venta", icon: Building2, permission: "branches.view" },
  { to: "/admin/configuracion?tab=roles", label: "Roles", description: "Permisos y accesos por rol", icon: ShieldCheck, permission: "roles.view" },
  { to: "/admin/configuracion?tab=actividad", label: "Actividad reciente", description: "Historial completo de actividad", icon: ScrollText, permission: "audit.view" },
  { to: "/admin/configuracion", label: "Configuración", description: "Datos generales de la empresa", icon: Settings, permission: "settings.manage" },
  { to: "/admin/perfil", label: "Mi perfil", description: "Tus datos y preferencias", icon: UserRound, permission: null },
];

const STOCK_STATUS_ORDER: Record<string, number> = { OUT: 0, CRITICAL: 1, LOW: 2 };

export function DashboardPage() {
  const { user } = useAuth();

  const canViewBranches = usePermission("branches.view");
  const canViewUsers = usePermission("users.view");
  const canViewRoles = usePermission("roles.view");
  const canViewInventory = usePermission("inventory.view");
  const canViewSales = usePermission("sales.view");
  const canViewReports = usePermission("reports.view");
  const canManageCash = usePermission("cash.manage");

  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [branchesStatus, setBranchesStatus] = useState<FetchStatus>(canViewBranches ? "loading" : "idle");

  const [users, setUsers] = useState<User[] | null>(null);
  const [usersStatus, setUsersStatus] = useState<FetchStatus>(canViewUsers ? "loading" : "idle");

  const [roles, setRoles] = useState<Role[] | null>(null);
  const [rolesStatus, setRolesStatus] = useState<FetchStatus>(canViewRoles ? "loading" : "idle");

  const [inventory, setInventory] = useState<InventoryRow[] | null>(null);
  const [inventoryStatus, setInventoryStatus] = useState<FetchStatus>(canViewInventory ? "loading" : "idle");

  const [sales, setSales] = useState<Sale[] | null>(null);
  const [salesStatus, setSalesStatus] = useState<FetchStatus>(canViewSales ? "loading" : "idle");

  const [ratingSummary, setRatingSummary] = useState<RatingSummary | null>(null);
  const [ratingStatus, setRatingStatus] = useState<FetchStatus>(canViewReports ? "loading" : "idle");

  // ---------- Recordatorio de caja abierta ----------
  // Resuelve la misma sucursal que usaría PosPage.tsx y verifica si ya hay
  // un turno de caja abierto ahí, usando la misma llamada que CajaPage/PosPage.
  const [cashCheckBranchId, setCashCheckBranchId] = useState("");
  const [openCashSession, setOpenCashSession] = useState<CashSession | null>(null);
  const [cashSessionChecked, setCashSessionChecked] = useState(false);

  useEffect(() => {
    if (!canManageCash || !user) return;
    if (user.allBranches) {
      branchService.listBranches()
        .then((list) => setCashCheckBranchId(list.find((b) => b.status === "ACTIVE")?.id ?? ""))
        .catch(() => {});
    } else {
      setCashCheckBranchId(user.branches[0]?.id ?? "");
    }
  }, [canManageCash, user]);

  useEffect(() => {
    if (!canManageCash || !cashCheckBranchId) return;
    let cancelled = false;
    cashSessionService.getCurrentSession(cashCheckBranchId)
      .then((session) => { if (!cancelled) { setOpenCashSession(session); setCashSessionChecked(true); } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [canManageCash, cashCheckBranchId]);

  const showCashReminder = canManageCash && cashSessionChecked && !openCashSession;

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

  useEffect(() => {
    if (!canViewSales) return;
    // 30 días cubre ambas gráficas (tendencia de 7 días + top de 30 días) en una sola petición.
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 29);
    saleService
      .listSales({ status: "COMPLETED", from: from.toISOString(), to: to.toISOString() })
      .then((rows) => { setSales(rows); setSalesStatus("ready"); })
      .catch(() => setSalesStatus("error"));
  }, [canViewSales]);

  useEffect(() => {
    if (!canViewReports) return;
    ratingService
      .getRatingSummary()
      .then((s) => { setRatingSummary(s); setRatingStatus("ready"); })
      .catch(() => setRatingStatus("error"));
  }, [canViewReports]);

  const activeBranches = branches?.filter((b) => b.status === "ACTIVE").length ?? null;
  const activeUsers = users?.filter((u) => u.status === "ACTIVE").length ?? null;
  const rolesInUse = roles?.filter((r) => r.assignedUsersCount > 0).length ?? null;

  const hasAnyStat = canViewBranches || canViewUsers || canViewRoles || canViewReports;
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

  // Últimos 7 días de calendario (incluyendo hoy), pre-inicializados en $0
  // para que un día sin ventas igual muestre su barra/etiqueta.
  const last7Days: DayTotal[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    return { key, label: d.toLocaleDateString("es-MX", { weekday: "short" }).replace(/^./, (c) => c.toUpperCase()), total: 0 };
  });
  (sales ?? []).forEach((s) => {
    const key = s.createdAt.slice(0, 10);
    const day = last7Days.find((d) => d.key === key);
    if (day) day.total += Number(s.total);
  });

  // Top 5 de productos por unidades vendidas en toda la ventana de 30 días.
  const productQtyMap = new Map<string, { name: string; qty: number }>();
  (sales ?? []).forEach((s) => {
    s.items.forEach((item) => {
      const key = item.variantId ? `${item.productId}:${item.variantId}` : item.productId;
      const name = item.variant ? `${item.product.name} — ${item.variant.name}` : item.product.name;
      const entry = productQtyMap.get(key) ?? { name, qty: 0 };
      entry.qty += item.quantity;
      productQtyMap.set(key, entry);
    });
  });
  const topProducts: ProductQty[] = Array.from(productQtyMap.entries())
    .map(([key, v]) => ({ key, name: v.name, qty: v.qty }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const hour = new Date().getHours();
  const greeting = getGreeting(hour, user?.displayName ?? "de nuevo");

  return (
    <div className="dashboard-page">
      <header className="dashboard-hero animate-in">
        <div className="dashboard-hero__text">
          <p className="dashboard-hero__eyebrow">{today}</p>
          {/* Same `motion`-based word-by-word reveal as the storefront
              hero's opening line — "las palabras de inicio... y las del
              admin" — rather than the plain instant text this h1 rendered
              before. */}
          <RevealWords as="h1" className="dashboard-hero__title" text={greeting.title} delay={80} />
          <p className="dashboard-hero__subtitle">{greeting.subtitle}</p>
          {user && (
            <p className="dashboard-hero__meta">
              {user.role.name}
              {user.allBranches ? " · Acceso a todas las sucursales" : ""}
            </p>
          )}
        </div>
        <div className="dashboard-hero__side">
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

      {showCashReminder && (
        <div className="dashboard-cash-reminder animate-in">
          <span className="dashboard-cash-reminder__icon">
            <AlertTriangle size={17} />
          </span>
          <div className="dashboard-cash-reminder__copy">
            <p className="dashboard-cash-reminder__title">Aún no abres caja hoy</p>
            <p className="dashboard-cash-reminder__text">Ábrela antes de registrar ventas en el punto de venta.</p>
          </div>
          <Link to="/admin/caja" className="dashboard-cash-reminder__button">
            <Unlock size={15} /> Abrir caja
          </Link>
        </div>
      )}

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
                        {INVENTORY_STATUS_LABEL[row.status]} · {row.stock}
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

        <PermissionGate code="sales.view">
          <section className="dashboard-panel dashboard-panel--sales-trend animate-in" style={{ animationDelay: "260ms" }}>
            <header className="dashboard-panel__header">
              <div className="dashboard-panel__title">
                <TrendingUp size={17} />
                <h2>Ventas — últimos 7 días</h2>
              </div>
            </header>
            {salesStatus === "loading" && <StatusState kind="loading" />}
            {salesStatus === "error" && <StatusState kind="error" message="No se pudieron cargar las ventas." />}
            {salesStatus === "ready" && <SalesTrendChart days={last7Days} />}
          </section>
        </PermissionGate>

        <PermissionGate code="sales.view">
          <section className="dashboard-panel dashboard-panel--top-products animate-in" style={{ animationDelay: "300ms" }}>
            <header className="dashboard-panel__header">
              <div className="dashboard-panel__title">
                <Sparkles size={17} />
                <h2>Más vendidos — últimos 30 días</h2>
              </div>
            </header>
            {salesStatus === "loading" && <StatusState kind="loading" />}
            {salesStatus === "error" && <StatusState kind="error" message="No se pudieron cargar las ventas." />}
            {salesStatus === "ready" && <TopProductsBar data={topProducts} />}
          </section>
        </PermissionGate>
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
          <PermissionGate code="reports.view">
            <StatCard
              icon={Star}
              label="Satisfacción del sitio"
              value={ratingSummary ? Math.round(ratingSummary.average * 10) / 10 : null}
              caption={ratingSummary ? `${ratingSummary.total} calificaciones · de 5` : undefined}
              status={ratingStatus}
              errorMessage="No se pudo cargar"
              delay={210}
            />
          </PermissionGate>
        </section>
      )}
    </div>
  );
}
