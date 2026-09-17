import { type FormEvent, useState } from "react";
import { Modal } from "../../components/common/Modal";
import * as userService from "../../services/userService";
import type { Role, User } from "../../types/api";

interface UserFormModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: (user: User) => void;
  roles: Role[];
  editingUser?: User;
}

export function UserFormModal({ open, onClose, onSaved, roles, editingUser }: UserFormModalProps) {
  const [form, setForm] = useState({
    firstName: editingUser?.firstName ?? "",
    lastName: editingUser?.lastName ?? "",
    displayName: editingUser?.displayName ?? "",
    username: editingUser?.username ?? "",
    email: editingUser?.email ?? "",
    password: "",
    roleId: editingUser?.roleId ?? roles[0]?.id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = editingUser
        ? await userService.updateUser(editingUser.id, form)
        : await userService.createUser(form);
      onSaved(saved);
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
          <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        {error && <p className="user-form__error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
      </form>
    </Modal>
  );
}
