import { useEffect, useMemo, useState } from "react";
import { Pencil, Save, X, ShieldAlert, AlertTriangle, Plus, Trash2, Lock } from "lucide-react";
import { StatusState } from "../../components/common/StatusState";
import { Modal } from "../../components/common/Modal";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { ApiError } from "../../services/apiClient";
import { listRoles, updateRolePermissions, deleteRole } from "../../services/roleService";
import { RoleFormModal } from "./RoleFormModal";
import type { Role } from "../../types/api";
import "./RolesPage.css";

// There is no GET /api/permissions catalog endpoint yet, so the universe of
// every known permission code is derived from the "admin" role's own
// permissions array — by design (see BellaBack/prisma/seed.ts) admin is
// always seeded with every permission that exists. Falls back to the union
// across all roles if, for some reason, no admin-coded role is present.
function derivePermissionUniverse(roles: Role[]): string[] {
  const admin = roles.find((r) => r.code === "admin");
  if (admin) return [...admin.permissions].sort();
  const union = new Set<string>();
  roles.forEach((r) => r.permissions.forEach((p) => union.add(p)));
  return Array.from(union).sort();
}

// Human-readable labels for every permission code — mirrors the
// descriptions seeded in BellaBack/prisma/seed.ts's PERMISSIONS list.
// Raw codes (products.view, roles.manage, ...) read as internal plumbing to
// a non-technical admin; the label is what's shown, the code stays visible
// as a small caption/title for anyone who needs the literal value.
const PERMISSION_LABELS: Record<string, string> = {
  "products.view": "Ver productos",
  "products.create": "Crear productos",
  "products.edit": "Editar productos",
  "products.delete": "Eliminar productos",
  "inventory.view": "Ver inventario",
  "inventory.adjust": "Ajustar inventario",
  "inventory.count": "Realizar inventarios físicos",
  "inventory.transfer": "Crear transferencias",
  "inventory.receive": "Recibir transferencias/compras",
  "sales.view": "Ver ventas",
  "sales.create": "Registrar ventas",
  "sales.cancel": "Cancelar ventas",
  "sales.return": "Registrar devoluciones",
  "discounts.create": "Crear descuentos",
  "discounts.apply": "Aplicar descuentos",
  "discounts.authorize": "Autorizar descuentos",
  "users.view": "Ver usuarios",
  "users.create": "Crear usuarios",
  "users.edit": "Editar usuarios",
  "users.disable": "Desactivar usuarios",
  "roles.view": "Ver roles",
  "roles.manage": "Gestionar roles y permisos",
  "branches.view": "Ver sucursales",
  "branches.manage": "Gestionar sucursales",
  "purchases.view": "Ver compras",
  "purchases.create": "Crear compras",
  "purchases.receive": "Recibir compras",
  "reports.view": "Ver reportes",
  "audit.view": "Ver actividad reciente",
  "ecommerce.manage": "Gestionar catálogo ecommerce",
  "orders.view": "Ver pedidos online",
  "orders.update": "Actualizar pedidos online",
  "settings.manage": "Gestionar configuración de la empresa",
};

function permissionLabel(code: string): string {
  return PERMISSION_LABELS[code] ?? code;
}

// Generous, not exhaustive: anything that grants broad administrative
// control, lets a role escalate/manage other accounts, or has a
// destructive/financial-override effect. Erring toward flagging more
// rather than fewer permissions, per the task's explicit instruction.
const SENSITIVE_PERMISSIONS: Record<string, string> = {
  "roles.manage": "Permite modificar los permisos de cualquier rol, incluido este mismo — control administrativo total sobre accesos.",
  "settings.manage": "Permite cambiar la configuración general de la empresa.",
  "branches.manage": "Permite crear, editar y desactivar sucursales.",
  "users.create": "Permite crear cuentas de usuario nuevas, incluyendo con roles administrativos.",
  "users.edit": "Permite editar cualquier usuario, incluido su rol asignado — riesgo de escalamiento de privilegios.",
  "users.disable": "Permite deshabilitar el acceso de cualquier usuario del sistema.",
  "products.delete": "Permite eliminar productos de forma permanente.",
  "inventory.adjust": "Permite modificar manualmente las existencias de inventario.",
  "sales.cancel": "Permite cancelar ventas ya registradas.",
  "sales.return": "Permite registrar devoluciones con impacto financiero.",
  "discounts.authorize": "Permite autorizar descuentos fuera de las reglas estándar.",
  "ecommerce.manage": "Permite administrar el catálogo publicado en la tienda en línea.",
  "orders.update": "Permite modificar o cancelar pedidos en línea de clientes.",
  "purchases.receive": "Permite confirmar la recepción de compras, afectando inventario y cuentas por pagar.",
};

function isSensitive(code: string): boolean {
  return code in SENSITIVE_PERMISSIONS;
}

// Groups "products.view" -> "products" so the editable checklist reads as
// sectioned modules instead of one flat wall of chips.
function moduleOf(code: string): string {
  return code.split(".")[0];
}

const MODULE_LABELS: Record<string, string> = {
  products: "Productos", inventory: "Inventario", sales: "Ventas", discounts: "Descuentos",
  users: "Usuarios", roles: "Roles", branches: "Sucursales", purchases: "Compras",
  reports: "Reportes", audit: "Actividad reciente", ecommerce: "Tienda en línea", orders: "Pedidos",
  settings: "Configuración",
};

export function RolesPage() {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    listRoles()
      .then((r) => { setRoles(r); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, []);

  const universe = useMemo(() => (roles ? derivePermissionUniverse(roles) : []), [roles]);
  const grouped = useMemo(() => {
    const map = new Map<string, string[]>();
    universe.forEach((code) => {
      const mod = moduleOf(code);
      if (!map.has(mod)) map.set(mod, []);
      map.get(mod)!.push(code);
    });
    return Array.from(map.entries());
  }, [universe]);

  function startEditing(role: Role) {
    setEditingRoleId(role.id);
    setPending(new Set(role.permissions));
    setSaveError(null);
  }

  function cancelEditing() {
    setEditingRoleId(null);
    setPending(new Set());
    setSaveError(null);
  }

  function requestToggle(code: string) {
    const turningOn = !pending.has(code);
    if (turningOn && isSensitive(code)) {
      setConfirmCode(code);
      return;
    }
    applyToggle(code);
  }

  function applyToggle(code: string) {
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function confirmSensitiveEnable() {
    if (confirmCode) applyToggle(confirmCode);
    setConfirmCode(null);
  }

  async function saveEditing(role: Role) {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updateRolePermissions(role.id, Array.from(pending));
      setRoles((prev) => prev?.map((r) => (r.id === updated.id ? updated : r)) ?? prev);
      cancelEditing();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "No se pudieron guardar los permisos.");
    } finally {
      setSaving(false);
    }
  }

  function handleRoleCreated(role: Role) {
    setRoles((prev) => (prev ? [...prev, role].sort((a, b) => a.name.localeCompare(b.name)) : [role]));
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteRole(deleteTarget.id);
      setRoles((prev) => prev?.filter((r) => r.id !== deleteTarget.id) ?? prev);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "No se pudo eliminar el rol.");
    } finally {
      setDeleting(false);
    }
  }

  if (status === "loading") return <StatusState kind="loading" />;
  if (status === "error" || !roles) return <StatusState kind="error" message="No se pudieron cargar los roles." />;

  const confirmDescription = confirmCode ? SENSITIVE_PERMISSIONS[confirmCode] : null;

  return (
    <div className="roles-page">
      <div className="roles-page__header">
        <div>
          <h1>Roles</h1>
          <p className="roles-page__subtitle">Consulta los permisos de cada rol. Los usuarios con permiso "Gestionar roles y permisos" pueden editarlos, crear roles nuevos o eliminar los que ya no se usen.</p>
        </div>
        <PermissionGate code="roles.manage">
          <button type="button" className="roles-page__create" onClick={() => setCreateOpen(true)}>
            <Plus size={16} /> Nuevo rol
          </button>
        </PermissionGate>
      </div>

      <div className="roles-grid">
        {roles.map((role, i) => {
          const editing = editingRoleId === role.id;
          const activePermissions = editing ? pending : new Set(role.permissions);
          return (
            <article key={role.id} className="role-card" style={{ animationDelay: `${Math.min(i, 10) * 60}ms` }}>
              <header>
                <div className="role-card__title">
                  <h2>{role.name}</h2>
                  {role.isSystem
                    ? <span className="role-card__badge role-card__badge--system"><Lock size={10} /> Predeterminado</span>
                    : <span className="role-card__badge role-card__badge--custom">Personalizado</span>}
                </div>
                <span className="role-card__count">{role.assignedUsersCount} usuario{role.assignedUsersCount === 1 ? "" : "s"}</span>
              </header>
              <p className="role-card__description">{role.description}</p>

              {!editing && (
                <div className="role-card__permissions">
                  {role.permissions.length === 0 && <span className="role-card__empty">Sin permisos asignados</span>}
                  {role.permissions.map((p) => (
                    <span key={p} className={`role-card__permission${isSensitive(p) ? " role-card__permission--sensitive" : ""}`} title={p}>
                      {isSensitive(p) && <ShieldAlert size={11} />} {permissionLabel(p)}
                    </span>
                  ))}
                </div>
              )}

              {editing && (
                <div className="role-card__editor">
                  {grouped.map(([mod, codes]) => (
                    <div key={mod} className="role-card__module">
                      <p className="role-card__module-label">{MODULE_LABELS[mod] ?? mod}</p>
                      <div className="role-card__permissions">
                        {codes.map((code) => {
                          const on = activePermissions.has(code);
                          return (
                            <button
                              type="button"
                              key={code}
                              onClick={() => requestToggle(code)}
                              className={`role-card__permission role-card__permission--toggle${on ? " is-on" : " is-off"}${isSensitive(code) ? " role-card__permission--sensitive" : ""}`}
                              title={code}
                            >
                              {isSensitive(code) && <ShieldAlert size={11} />} {permissionLabel(code)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {saveError && <p className="roles-page__error">{saveError}</p>}
                  <div className="role-card__editor-actions">
                    <button type="button" className="role-card__save" onClick={() => saveEditing(role)} disabled={saving}>
                      <Save size={14} /> {saving ? "Guardando..." : "Guardar"}
                    </button>
                    <button type="button" className="role-card__cancel" onClick={cancelEditing} disabled={saving}>
                      <X size={14} /> Cancelar
                    </button>
                  </div>
                </div>
              )}

              {!editing && (
                <PermissionGate code="roles.manage">
                  <div className="role-card__actions">
                    <button type="button" onClick={() => startEditing(role)}><Pencil size={14} /> Editar permisos</button>
                    {!role.isSystem && (
                      <button
                        type="button"
                        className="role-card__delete"
                        onClick={() => { setDeleteTarget(role); setDeleteError(null); }}
                      >
                        <Trash2 size={14} /> Eliminar
                      </button>
                    )}
                  </div>
                </PermissionGate>
              )}
            </article>
          );
        })}
      </div>

      <RoleFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={handleRoleCreated}
        grouped={grouped}
        moduleLabels={MODULE_LABELS}
        permissionLabels={PERMISSION_LABELS}
      />

      <Modal open={confirmCode !== null} onClose={() => setConfirmCode(null)} title="Permiso sensible">
        <div className="roles-confirm">
          <p className="roles-confirm__intro">
            <AlertTriangle size={16} /> Estás a punto de habilitar "{confirmCode ? permissionLabel(confirmCode) : ""}".
          </p>
          <p className="roles-confirm__description">{confirmDescription}</p>
          <div className="roles-confirm__actions">
            <button type="button" className="roles-confirm__cancel" onClick={() => setConfirmCode(null)}>Cancelar</button>
            <button type="button" className="roles-confirm__accept" onClick={confirmSensitiveEnable}>Sí, habilitar</button>
          </div>
        </div>
      </Modal>

      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Eliminar rol">
        <div className="roles-confirm">
          <p className="roles-confirm__intro">
            <AlertTriangle size={16} /> ¿Eliminar el rol "{deleteTarget?.name}"?
          </p>
          <p className="roles-confirm__description">
            Esta acción no se puede deshacer. Solo es posible si ningún usuario tiene este rol asignado actualmente.
          </p>
          {deleteError && <p className="roles-page__error">{deleteError}</p>}
          <div className="roles-confirm__actions">
            <button type="button" className="roles-confirm__cancel" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</button>
            <button type="button" className="roles-confirm__accept" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Eliminando..." : "Sí, eliminar"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
