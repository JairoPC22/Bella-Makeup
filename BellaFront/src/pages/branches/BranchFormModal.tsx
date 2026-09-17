import { type FormEvent, useState } from "react";
import { Modal } from "../../components/common/Modal";
import { ApiError } from "../../services/apiClient";
import * as branchService from "../../services/branchService";
import type { Branch } from "../../types/api";

export function BranchFormModal({ open, onClose, onSaved, editingBranch }: {
  open: boolean; onClose: () => void; onSaved: (b: Branch) => void; editingBranch?: Branch;
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
        <label>Responsable<input value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })} /></label>
        {error && <p className="branch-form__error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
      </form>
    </Modal>
  );
}
