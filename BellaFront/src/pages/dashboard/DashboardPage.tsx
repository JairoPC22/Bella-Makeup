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
  History,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { usePermission } from "../../hooks/usePermission";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { Avatar } from "../../components/common/Avatar";
import { StatusState } from "../../components/common/StatusState";
import * as branchService from "../../services/branchService";
import * as userService from "../../services/userService";
import * as roleService from "../../services/roleService";
import { listAudit } from "../../services/auditService";
import type { AuditLogEntry, Branch, Role, User } from "../../types/api";
import "./DashboardPage.css";

type FetchStatus = "idle" | "loading" | "ready" | "error";

// Compact label map for the audit feed shown on this page — mirrors the
// codes AuditPage already labels, kept as its own local copy since this
// page only needs a subset and shouldn't reach into another page's module.
const ACTION_LABELS: Record<string, string> = {
  "auth.login": "inició sesión",
  "auth.logout": "cerró sesión",
  "profile.update": "actualizó su perfil",
  "profile.change_password": "cambió su contraseña",
  "profile.change_avatar": "cambió su avatar",
  "users.create": "creó un usuario",
  "users.update": "actualizó un usuario",
  "users.enable": "habilitó un usuario",
  "users.disable": "deshabilitó un usuario",
  "users.assign_branches": "asignó sucursales",
  "branches.create": "creó una sucursal",
  "branches.update": "actualizó una sucursal",
  "branches.activate": "activó una sucursal",
  "branches.deactivate": "desactivó una sucursal",
  "settings.update": "actualizó la configuración",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 45) return "hace un momento";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} minuto${diffMin === 1 ? "" : "s"}`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `hace ${diffHour} hora${diffHour === 1 ? "" : "s"}`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay < 7) return `hace ${diffDay} día${diffDay === 1 ? "" : "s"}`;
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

const today = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

// The `--stagger-delay` custom property (consumed by .animate-in-stagger in
// global.css) isn't part of csstype's CSSProperties, so it needs an escape
// hatch through `unknown` rather than a direct assertion.
function staggerStyle(ms: number): CSSProperties {
  return { "--stagger-delay": `${ms}ms` } as unknown as CSSProperties;
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
  { to: "/auditoria", label: "Auditoría", description: "Historial completo de actividad", icon: ScrollText, permission: "audit.view" },
  { to: "/configuracion", label: "Configuración", description: "Datos generales de la empresa", icon: Settings, permission: "settings.manage" },
  { to: "/perfil", label: "Mi perfil", description: "Tus datos y preferencias", icon: UserRound, permission: null },
];

export function DashboardPage() {
  const { user } = useAuth();

  const canViewBranches = usePermission("branches.view");
  const canViewUsers = usePermission("users.view");
  const canViewRoles = usePermission("roles.view");
  const canViewAudit = usePermission("audit.view");

  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [branchesStatus, setBranchesStatus] = useState<FetchStatus>(canViewBranches ? "loading" : "idle");

  const [users, setUsers] = useState<User[] | null>(null);
  const [usersStatus, setUsersStatus] = useState<FetchStatus>(canViewUsers ? "loading" : "idle");

  const [roles, setRoles] = useState<Role[] | null>(null);
  const [rolesStatus, setRolesStatus] = useState<FetchStatus>(canViewRoles ? "loading" : "idle");

  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[] | null>(null);
  const [auditStatus, setAuditStatus] = useState<FetchStatus>(canViewAudit ? "loading" : "idle");

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
    if (!canViewAudit) return;
    listAudit({ page: 1, pageSize: 8 })
      .then((res) => { setAuditEntries(res.items); setAuditStatus("ready"); })
      .catch(() => setAuditStatus("error"));
  }, [canViewAudit]);

  const activeBranches = branches?.filter((b) => b.status === "ACTIVE").length ?? null;
  const activeUsers = users?.filter((u) => u.status === "ACTIVE").length ?? null;
  const rolesInUse = roles?.filter((r) => r.assignedUsersCount > 0).length ?? null;

  const hasAnyStat = canViewBranches || canViewUsers || canViewRoles;
  const visibleQuickLinks = QUICK_LINKS; // permission gating happens per-item via PermissionGate

  return (
    <div className="dashboard-page">
      <header className="dashboard-hero animate-in">
        <div className="dashboard-hero__glow" aria-hidden="true" />
        <div className="dashboard-hero__grid" aria-hidden="true" />
        <div className="dashboard-hero__content">
          <p className="dashboard-hero__eyebrow">{today}</p>
          <h1 className="dashboard-hero__title">{getGreeting()}, {user?.displayName ?? "de nuevo"}</h1>
          <p className="dashboard-hero__subtitle">
            {user?.role.name ?? "Sin rol"}
            {user?.allBranches ? " · Acceso a todas las sucursales" : ""}
          </p>
        </div>
        {user && (
          <div className="dashboard-hero__avatar">
            <Avatar avatarStyle={user.avatarStyle} avatarSeed={user.avatarSeed} displayName={user.displayName} size="lg" />
          </div>
        )}
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
        <PermissionGate code="audit.view">
          <section className="dashboard-panel dashboard-panel--activity animate-in" style={{ animationDelay: "180ms" }}>
            <header className="dashboard-panel__header">
              <div className="dashboard-panel__title">
                <History size={17} />
                <h2>Actividad reciente</h2>
              </div>
              <Link to="/auditoria" className="dashboard-panel__link">Ver todo <ArrowUpRight size={14} /></Link>
            </header>

            {auditStatus === "loading" && <StatusState kind="loading" />}
            {auditStatus === "error" && <StatusState kind="error" message="No se pudo cargar la actividad reciente." />}
            {auditStatus === "ready" && auditEntries?.length === 0 && (
              <StatusState kind="empty" message="Todavía no hay actividad registrada." />
            )}
            {auditStatus === "ready" && auditEntries && auditEntries.length > 0 && (
              <ul className="activity-list">
                {auditEntries.map((entry, i) => (
                  <li key={entry.id} className="activity-item animate-in-stagger" style={staggerStyle(Math.min(i, 8) * 40)}>
                    {entry.user ? (
                      <Avatar avatarStyle={entry.user.avatarStyle} avatarSeed={entry.user.avatarSeed} displayName={entry.user.displayName} size="sm" />
                    ) : (
                      <div className="activity-item__system-avatar" aria-hidden="true" />
                    )}
                    <div className="activity-item__body">
                      <p>
                        <strong>{entry.user?.displayName ?? "Sistema"}</strong> {actionLabel(entry.action)}
                        {entry.branch ? <span className="activity-item__branch"> · {entry.branch.name}</span> : null}
                      </p>
                      <p className="activity-item__time">{formatRelativeTime(entry.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
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
