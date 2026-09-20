import { type FormEvent, useState } from "react";
import { Modal } from "../../components/common/Modal";
import { Select } from "../../components/common/Select";
import { ApiError } from "../../services/apiClient";
import * as branchService from "../../services/branchService";
import type { Branch, User } from "../../types/api";

export function BranchFormModal({ open, onClose, onSaved, editingBranch, users }: {
  open: boolean; onClose: () => void; onSaved: (b: Branch) => void; editingBranch?: Branch; users: User[];
}) {
  const [form, setForm] = useState({
    name: editingBranch?.name ?? "",
    address: editingBranch?.address ?? "",
    phone: editingBranch?.phone ?? "",
    schedule: editingBranch?.schedule ?? "",
    managerName: editingBranch?.managerName ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = editingBranch
        ? await branchService.updateBranch(editingBranch.id, form)
        : await branchService.createBranch(form);
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar la sucursal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editingBranch ? "Editar sucursal" : "Nueva sucursal"}>
      <form onSubmit={handleSubmit} className="branch-form">
        <label>Nombre<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Dirección<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
        <label>Teléfono<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label>Horario<input value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} /></label>
        <label>Responsable
          <Select value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })}>
            <option value="">Sin responsable asignado</option>
            {/* managerName is stored as a plain display-name string (no
                Branch.managerId FK on this backend), so an existing value
                that doesn't match any current user's displayName — e.g.
                legacy free-text data, or a user renamed/removed since —
                is kept as its own selectable option instead of being
                silently dropped from the dropdown. */}
            {form.managerName && !users.some((u) => u.displayName === form.managerName) && (
              <option value={form.managerName}>{form.managerName} (no coincide con un usuario actual)</option>
            )}
            {users.map((u) => <option key={u.id} value={u.displayName}>{u.displayName}</option>)}
          </Select>
        </label>
        {error && <p className="branch-form__error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
      </form>
    </Modal>
  );
}
