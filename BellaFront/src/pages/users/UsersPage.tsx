import { useEffect, useState } from "react";
import { Plus, Pencil, Ban, CheckCircle2 } from "lucide-react";
import { Avatar } from "../../components/common/Avatar";
import { Badge } from "../../components/common/Badge";
import { StatusState } from "../../components/common/StatusState";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { UserFormModal } from "./UserFormModal";
import * as userService from "../../services/userService";
import * as roleService from "../../services/roleService";
import * as branchService from "../../services/branchService";
import type { User, Role, Branch } from "../../types/api";
import "./UsersPage.css";
import { staggerStyle } from "../../utils/staggerStyle";

export function UsersPage({ embedded = false }: { embedded?: boolean }) {
  const [users, setUsers] = useState<User[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [actionError, setActionError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | undefined>(undefined);

  useEffect(() => {
    Promise.all([userService.listUsers(), roleService.listRoles(), branchService.listBranches()])
      .then(([u, r, b]) => { setUsers(u); setRoles(r); setBranches(b); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, []);

  function upsertUser(user: User) {
    setUsers((prev) => {
      if (!prev) return [user];
      const exists = prev.some((u) => u.id === user.id);
      return exists ? prev.map((u) => (u.id === user.id ? user : u)) : [user, ...prev];
    });
  }

  async function toggleStatus(user: User) {
    setActionError(null);
    try {
      const updated = await userService.updateUserStatus(user.id, user.status === "ACTIVE" ? "DISABLED" : "ACTIVE");
      upsertUser(updated);
    } catch {
      setActionError("No se pudo actualizar el estado del usuario.");
    }
  }

  if (status === "loading") return <StatusState kind="loading" />;
  if (status === "error") return <StatusState kind="error" message="No se pudieron cargar los usuarios." />;

  return (
    <div className="users-page">
      <div className="users-page__header">
        {embedded ? <div /> : <h1>Usuarios</h1>}
        <PermissionGate code="users.create">
          <button onClick={() => { setEditingUser(undefined); setModalOpen(true); }}><Plus size={16} /> Nuevo usuario</button>
        </PermissionGate>
      </div>

      {actionError && <p className="users-page__error">{actionError}</p>}

      {users && users.length === 0 && <StatusState kind="empty" message="Todavía no hay usuarios." />}

      {users && users.length > 0 && (
        <table className="users-table">
          <thead>
            <tr><th></th><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Sucursales</th><th>Estado</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id} className="animate-in-stagger" style={staggerStyle(Math.min(i, 10) * 35)}>
                <td><Avatar avatarStyle={u.avatarStyle} avatarSeed={u.avatarSeed} displayName={u.displayName} size="sm" /></td>
                <td>{u.displayName}</td>
                <td>{u.username}</td>
                <td>{u.role.name}</td>
                {/* Read-only, always — branch assignment used to be a live
                    multi-select right in this cell, which made it far too
                    easy to change someone's access with a stray click. The
                    only way to change it now is the "Editar" button below,
                    which opens UserFormModal's proper checkbox list; that
                    button is already users.edit-gated (admin-only in every
                    seeded role today), so this cell never needs its own
                    permission check anymore. */}
                <td className="users-table__branches">
                  {u.allBranches ? "Todas" : (u.branches.length > 0 ? u.branches.map((b) => b.name).join(", ") : "Sin sucursales")}
                </td>
                <td><Badge tone={u.status === "ACTIVE" ? "success" : "neutral"}>{u.status === "ACTIVE" ? "Activo" : "Inactivo"}</Badge></td>
                <td>
                  <PermissionGate code="users.edit">
                    <button onClick={() => { setEditingUser(u); setModalOpen(true); }} aria-label="Editar"><Pencil size={16} /></button>
                  </PermissionGate>
                  <PermissionGate code="users.disable">
                    <button onClick={() => toggleStatus(u)} aria-label="Cambiar estado">
                      {u.status === "ACTIVE" ? <Ban size={16} /> : <CheckCircle2 size={16} />}
                    </button>
                  </PermissionGate>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <UserFormModal
        key={editingUser?.id ?? "new"}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={upsertUser}
        roles={roles}
        branches={branches}
        editingUser={editingUser}
      />
    </div>
  );
}
