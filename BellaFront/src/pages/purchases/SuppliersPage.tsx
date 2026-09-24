import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Pencil, Plus, Users, AlertTriangle, Loader2 } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { Badge } from "../../components/common/Badge";
import { Modal } from "../../components/common/Modal";
import { Select } from "../../components/common/Select";
import { ApiError } from "../../services/apiClient";
import * as supplierService from "../../services/supplierService";
import type { Supplier } from "../../types/api";
import "./SuppliersPage.css";

// Página simple y secundaria a propósito: una tabla más un modal pequeño.
// Los proveedores son datos de apoyo para el flujo de compras (el
// protagonista es PurchasesPage), por eso no tiene filtros, vista de
// detalle ni entrada propia en el sidebar; se accede desde el link
// "Gestionar proveedores" de esa página.

interface SupplierForm {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  status: Supplier["status"];
}

const EMPTY_FORM: SupplierForm = { name: "", contactName: "", phone: "", email: "", status: "ACTIVE" };

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supplierService
      .listSuppliers()
      .then((rows) => { setSuppliers(rows); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(supplier: Supplier) {
    setEditing(supplier);
    setForm({
      name: supplier.name,
      contactName: supplier.contactName ?? "",
      phone: supplier.phone ?? "",
      email: supplier.email ?? "",
      status: supplier.status,
    });
    setError(null);
    setModalOpen(true);
  }

  function upsert(supplier: Supplier) {
    setSuppliers((prev) => {
      if (!prev) return [supplier];
      const exists = prev.some((s) => s.id === supplier.id);
      const next = exists ? prev.map((s) => (s.id === supplier.id ? supplier : s)) : [...prev, supplier];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  async function handleSave() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      // Los esquemas del backend usan `.min(1)` en cada string opcional, así
      // que un campo vaciado debe omitirse en vez de enviarse como "".
      const base = {
        name: form.name.trim(),
        contactName: form.contactName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
      };
      const saved = editing
        ? await supplierService.updateSupplier(editing.id, { ...base, status: form.status })
        : await supplierService.createSupplier(base);
      upsert(saved);
      setModalOpen(false);
    } catch (err) {
      // Se muestra el mensaje de validación real del servidor en vez de uno genérico.
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el proveedor.");
    } finally {
      setSaving(false);
    }
  }

  const rows = suppliers ?? [];

  return (
    <div className="suppliers-page">
      <div className="suppliers-page__header">
        <div className="suppliers-page__title">
          <Users size={22} />
          <h1>Proveedores</h1>
        </div>
        <div className="suppliers-page__header-actions">
          <Link to="/admin/compras" className="suppliers-page__back">
            <ArrowLeft size={15} /> Volver a compras
          </Link>
          <button type="button" className="suppliers-page__new-btn" onClick={openCreate}>
            <Plus size={16} /> Nuevo proveedor
          </button>
        </div>
      </div>

      {status === "loading" && <StatusState kind="loading" />}
      {status === "error" && <StatusState kind="error" message="No se pudieron cargar los proveedores." />}
      {status === "ready" && rows.length === 0 && (
        <StatusState kind="empty" message="Todavía no hay proveedores registrados." />
      )}

      {status === "ready" && rows.length > 0 && (
        <table className="suppliers-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Contacto</th>
              <th>Teléfono</th>
              <th>Correo</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="suppliers-table__name">{s.name}</td>
                <td>{s.contactName ?? "—"}</td>
                <td>{s.phone ?? "—"}</td>
                <td>{s.email ?? "—"}</td>
                <td>
                  <Badge tone={s.status === "ACTIVE" ? "success" : "neutral"}>
                    {s.status === "ACTIVE" ? "Activo" : "Inactivo"}
                  </Badge>
                </td>
                <td>
                  <button
                    type="button"
                    className="suppliers-table__edit"
                    onClick={() => openEdit(s)}
                    aria-label={`Editar ${s.name}`}
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar ${editing.name}` : "Nuevo proveedor"}
        className="supplier-form-modal"
      >
        <div className="supplier-form">
          <label>
            Nombre
            <input
              autoFocus
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ej. Distribuidora Cosmética del Norte"
            />
          </label>
          <label>
            Persona de contacto
            <input
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              placeholder="Ej. Laura Medina"
            />
          </label>
          <div className="supplier-form__row">
            <label>
              Teléfono
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Ej. 81 1234 5678"
              />
            </label>
            <label>
              Correo
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Ej. ventas@proveedor.com"
              />
            </label>
          </div>
          {/* Status is update-only: the backend's createSupplier has no status
              field at all (new suppliers are ACTIVE by schema default). */}
          {editing && (
            <label>
              Estado
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as Supplier["status"] })}
              >
                <option value="ACTIVE">Activo</option>
                <option value="INACTIVE">Inactivo</option>
              </Select>
            </label>
          )}

          {error && <p className="supplier-form__error"><AlertTriangle size={14} /> {error}</p>}

          <button
            type="button"
            className="supplier-form__submit"
            onClick={handleSave}
            disabled={!form.name.trim() || saving}
          >
            {saving && <Loader2 size={15} className="spin" />}
            {saving ? "Guardando..." : editing ? "Guardar cambios" : "Crear proveedor"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
