import { type FormEvent, useState } from "react";
import { Modal } from "../../components/common/Modal";
import { Select } from "../../components/common/Select";
import * as userService from "../../services/userService";
import type { Branch, Role, User } from "../../types/api";

interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (user: User) => void;
  roles: Role[];
  branches: Branch[];
  editingUser?: User;
}

export function UserFormModal({ open, onClose, onSaved, roles, branches, editingUser }: UserFormModalProps) {
  const [form, setForm] = useState({
    firstName: editingUser?.firstName ?? "",
    lastName: editingUser?.lastName ?? "",
    displayName: editingUser?.displayName ?? "",
    username: editingUser?.username ?? "",
    email: editingUser?.email ?? "",
    password: "",
    roleId: editingUser?.roleId ?? roles[0]?.id ?? "",
  });
  // Branch assignment is a separate concern/endpoint from the user record
  // itself (assignBranches, PUT /users/:id/branches) but the client asked
  // for it to be set right here at creation time instead of only via the
  // Users table's row-level multi-select after the fact.
  const [allBranches, setAllBranches] = useState(editingUser?.allBranches ?? false);
  const [branchIds, setBranchIds] = useState<string[]>(editingUser?.branches.map((b) => b.id) ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refleja la validación del backend (userService.updateUser): el rol de
  // una cuenta Administrador nunca se puede cambiar. Se usa role.code
  // (estable) en vez de role.name (editable desde Roles).
  const isAdminAccount = editingUser?.role.code === "admin";

  function toggleBranch(id: string) {
    setBranchIds((prev) => (prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = editingUser
        ? await userService.updateUser(editingUser.id, form)
        : await userService.createUser(form);
      // La asignación de sucursales es un endpoint aparte, no va en el
      // payload de createUser/updateUser.
      const withBranches = await userService.assignBranches(saved.id, branchIds, allBranches);
      onSaved(withBranches);
      onClose();
    } catch {
      setError("No se pudo guardar el usuario.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editingUser ? "Editar usuario" : "Nuevo usuario"}>
      <form onSubmit={handleSubmit} className="user-form">
        <label>Nombre<input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></label>
        <label>Apellido<input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></label>
        <label>Nombre mostrado<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required /></label>
        <label>Usuario<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required disabled={!!editingUser} /></label>
        <label>Correo<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        {!editingUser && (
          <label>Contraseña<input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        )}
        <label>Rol
          <Select
            value={form.roleId}
            onChange={(e) => setForm({ ...form, roleId: e.target.value })}
            disabled={isAdminAccount}
          >
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
          {isAdminAccount && (
            <span className="user-form__role-locked">
              El rol de una cuenta de Administrador no se puede cambiar.
            </span>
          )}
        </label>

        <div className="user-form__branches">
          <span className="user-form__branches-label">Sucursales</span>
          <label className="user-form__branch-option user-form__branch-option--all">
            <input type="checkbox" checked={allBranches} onChange={(e) => setAllBranches(e.target.checked)} />
            Todas las sucursales
          </label>
          {!allBranches && (
            <div className="user-form__branch-list">
              {branches.length === 0 && <p className="user-form__branch-empty">No hay sucursales registradas.</p>}
              {branches.map((b) => (
                <label key={b.id} className="user-form__branch-option">
                  <input type="checkbox" checked={branchIds.includes(b.id)} onChange={() => toggleBranch(b.id)} />
                  {b.name}
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p className="user-form__error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
      </form>
    </Modal>
  );
}
