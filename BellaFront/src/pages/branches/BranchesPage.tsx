import { useEffect, useState } from "react";
import { Plus, Pencil, Power } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { Badge } from "../../components/common/Badge";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { BranchFormModal } from "./BranchFormModal";
import { BranchRevenueSection } from "./BranchRevenueSection";
import { ApiError } from "../../services/apiClient";
import * as branchService from "../../services/branchService";
import * as userService from "../../services/userService";
import type { Branch, User } from "../../types/api";
import "./BranchesPage.css";

export function BranchesPage() {
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [actionError, setActionError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | undefined>(undefined);

  useEffect(() => {
    // La lista de usuarios solo alimenta el dropdown "Responsable" del modal
    // de crear/editar. Se obtiene por separado para que un usuario sin
    // users.view igual pueda ver la lista de sucursales cargar bien.
    branchService.listBranches()
      .then((b) => { setBranches(b); setStatus("ready"); })
      .catch(() => setStatus("error"));
    userService.listUsers().then(setUsers).catch(() => {});
  }, []);

  function upsert(branch: Branch) {
    setBranches((prev) => {
      if (!prev) return [branch];
      const exists = prev.some((b) => b.id === branch.id);
      return exists ? prev.map((b) => (b.id === branch.id ? branch : b)) : [...prev, branch];
    });
  }

  async function toggleStatus(branch: Branch) {
    setActionError(null);
    try {
      const updated = await branchService.updateBranchStatus(branch.id, branch.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
      upsert(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "No se pudo actualizar el estado de la sucursal.");
    }
  }

  if (status === "loading") return <StatusState kind="loading" />;
  if (status === "error") return <StatusState kind="error" message="No se pudieron cargar las sucursales." />;

  return (
    <div className="branches-page">
      <div className="branches-page__header">
        <h1>Sucursales</h1>
        <PermissionGate code="branches.manage">
          <button onClick={() => { setEditingBranch(undefined); setModalOpen(true); }}><Plus size={16} /> Nueva sucursal</button>
        </PermissionGate>
      </div>

      {actionError && <p className="branches-page__error">{actionError}</p>}

      {branches && branches.length === 0 && <StatusState kind="empty" message="Todavía no hay sucursales." />}

      <div className="branches-grid">
        {branches?.map((b, i) => (
          <article key={b.id} className="branch-card" style={{ animationDelay: `${Math.min(i, 10) * 60}ms` }}>
            <header>
              <h2>{b.name}</h2>
              <Badge tone={b.status === "ACTIVE" ? "success" : "neutral"}>{b.status === "ACTIVE" ? "Activa" : "Inactiva"}</Badge>
            </header>
            {b.address && <p>{b.address}</p>}
            {b.phone && <p>{b.phone}</p>}
            {b.schedule && <p>{b.schedule}</p>}
            {b.managerName && <p>Responsable: {b.managerName}</p>}
            <PermissionGate code="branches.manage">
              <div className="branch-card__actions">
                <button onClick={() => { setEditingBranch(b); setModalOpen(true); }}><Pencil size={14} /> Editar</button>
                <button onClick={() => toggleStatus(b)}><Power size={14} /> {b.status === "ACTIVE" ? "Desactivar" : "Activar"}</button>
              </div>
            </PermissionGate>
          </article>
        ))}
      </div>

      <BranchFormModal
        key={editingBranch?.id ?? "new"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={upsert}
        editingBranch={editingBranch}
        users={users}
      />

      {/* branches.manage es solo para admin (branch_manager tiene
          branches.view pero no branches.manage). El backend valida el
          mismo permiso de forma independiente; este gate es solo de UX. */}
      <PermissionGate code="branches.manage">
        <BranchRevenueSection />
      </PermissionGate>
    </div>
  );
}
