import { useEffect, useState } from "react";
import { Avatar } from "../../components/common/Avatar";
import { StatusState } from "../../components/common/StatusState";
import { listAudit } from "../../services/auditService";
import * as branchService from "../../services/branchService";
import * as userService from "../../services/userService";
import type { AuditLogEntry, Branch, User } from "../../types/api";
import "./AuditPage.css";

const MODULES = ["auth", "profile", "users", "branches", "settings"];

const PAGE_SIZE = 25;

// Short Spanish labels for every action string currently produced by
// BellaBack/src/services/*.ts's logAudit calls. Anything not listed here
// falls back to the raw code, so an unmapped future action never crashes
// this page — it just shows up unlabeled until someone adds it here.
const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Inicio de sesión",
  "auth.logout": "Cierre de sesión",
  "profile.update": "Actualización de perfil",
  "profile.change_password": "Cambio de contraseña",
  "profile.change_avatar": "Cambio de avatar",
  "users.create": "Creación de usuario",
  "users.update": "Actualización de usuario",
  "users.enable": "Usuario habilitado",
  "users.disable": "Usuario deshabilitado",
  "users.assign_branches": "Asignación de sucursales",
  "branches.create": "Creación de sucursal",
  "branches.update": "Actualización de sucursal",
  "branches.activate": "Sucursal activada",
  "branches.deactivate": "Sucursal desactivada",
  "settings.update": "Actualización de configuración",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export function AuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [module, setModule] = useState("");
  const [branchId, setBranchId] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    branchService.listBranches().then(setBranches).catch(() => {});
    userService.listUsers().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    setStatus("loading");
    listAudit({
      module: module || undefined,
      branchId: branchId || undefined,
      userId: userId || undefined,
      from: from || undefined,
      to: to || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((res) => { setEntries(res.items); setTotal(res.total); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [module, branchId, userId, from, to, page]);

  return (
    <div className="audit-page">
      <h1>Auditoría</h1>

      <div className="audit-filters">
        <select value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }}>
          <option value="">Todos los módulos</option>
          {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={branchId} onChange={(e) => { setBranchId(e.target.value); setPage(1); }}>
          <option value="">Todas las sucursales</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }}>
          <option value="">Todos los usuarios</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
        </select>
        <label className="audit-filters__date">
          Desde
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </label>
        <label className="audit-filters__date">
          Hasta
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </label>
      </div>

      {status === "loading" && <StatusState kind="loading" />}
      {status === "error" && <StatusState kind="error" message="No se pudo cargar la auditoría." />}
      {status === "ready" && entries?.length === 0 && <StatusState kind="empty" message="No hay eventos con estos filtros." />}

      {status === "ready" && entries && entries.length > 0 && (
        <ul className="audit-list">
          {entries.map((entry) => (
            <li key={entry.id} className="audit-item">
              {entry.user ? (
                <Avatar avatarStyle={entry.user.avatarStyle} avatarSeed={entry.user.avatarSeed} displayName={entry.user.displayName} size="sm" />
              ) : (
                <div className="audit-item__system-avatar" />
              )}
              <div>
                <p><strong>{entry.user?.displayName ?? "Sistema"}</strong> — {actionLabel(entry.action)}</p>
                <p className="audit-item__meta">
                  {entry.module}{entry.branch ? ` · ${entry.branch.name}` : ""} · {new Date(entry.createdAt).toLocaleString("es-MX")}
                </p>
                {entry.entityType && (
                  <p className="audit-item__meta">
                    Registro afectado: {entry.entityType}{entry.entityId ? ` · ${entry.entityId}` : ""}
                  </p>
                )}
                {entry.details && Object.keys(entry.details).length > 0 && (
                  <p className="audit-item__details">{JSON.stringify(entry.details)}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {total > PAGE_SIZE && (
        <div className="audit-pagination">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <span>Página {page}</span>
          <button disabled={page * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
        </div>
      )}
    </div>
  );
}
