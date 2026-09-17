import { useEffect, useState } from "react";
import { Avatar } from "../../components/common/Avatar";
import { StatusState } from "../../components/common/StatusState";
import { listAudit } from "../../services/auditService";
import * as branchService from "../../services/branchService";
import type { AuditLogEntry, Branch } from "../../types/api";
import "./AuditPage.css";

const MODULES = ["auth", "profile", "users", "branches", "settings"];

export function AuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [module, setModule] = useState("");
  const [branchId, setBranchId] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    branchService.listBranches().then(setBranches).catch(() => {});
  }, []);

  useEffect(() => {
    setStatus("loading");
    listAudit({ module: module || undefined, branchId: branchId || undefined, page })
      .then((res) => { setEntries(res.items); setTotal(res.total); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [module, branchId, page]);

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
                <p><strong>{entry.user?.displayName ?? "Sistema"}</strong> — {entry.action}</p>
                <p className="audit-item__meta">
                  {entry.module}{entry.branch ? ` · ${entry.branch.name}` : ""} · {new Date(entry.createdAt).toLocaleString("es-MX")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {total > 25 && (
        <div className="audit-pagination">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</button>
          <span>Página {page}</span>
          <button disabled={page * 25 >= total} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
        </div>
      )}
    </div>
  );
}
