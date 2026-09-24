import { useEffect, useState } from "react";
import { Avatar } from "../../components/common/Avatar";
import { StatusState } from "../../components/common/StatusState";
import { Select } from "../../components/common/Select";
import { DateRangePicker } from "../../components/common/DateRangePicker";
import { listAudit } from "../../services/auditService";
import * as branchService from "../../services/branchService";
import * as userService from "../../services/userService";
import type { AuditLogEntry, Branch, User } from "../../types/api";
import "./AuditPage.css";

// Todos los módulos que BellaBack realmente envía a logAudit (verificado
// contra cada llamada a `logAudit({...})`). Mantener esta lista completa;
// si queda desactualizada, la página deja de poder etiquetar eventos.
const MODULES = [
  "auth", "profile", "users", "roles", "branches", "products", "inventory",
  "inventoryCounts", "transfers", "purchases", "sales", "cash", "returns",
  "mermas", "orders", "messages", "settings",
] as const;

const MODULE_LABELS: Record<string, string> = {
  auth: "Sesión", profile: "Perfil", users: "Usuarios", roles: "Roles",
  branches: "Sucursales", products: "Productos", inventory: "Inventario",
  inventoryCounts: "Inventarios físicos", transfers: "Transferencias",
  purchases: "Compras", sales: "Ventas", cash: "Caja", returns: "Devoluciones",
  mermas: "Mermas", orders: "Pedidos", messages: "Mensajes", settings: "Configuración",
};
function moduleLabel(mod: string): string {
  return MODULE_LABELS[mod] ?? mod;
}

const PAGE_SIZE = 25;

// Una entrada por cada acción real que producen los servicios de BellaBack.
// Si falta una acción aquí, se muestra su código interno crudo (p. ej.
// "inventoryCounts.complete") en lugar de un texto legible, pero nunca falla.
const ACTION_LABELS: Record<string, string> = {
  "auth.login": "inició sesión",
  "auth.logout": "cerró sesión",
  "auth.verify_pin": "autorizó una acción con su PIN de supervisor",
  "auth.verify_pin_failed": "intentó autorizar una acción con un PIN incorrecto",
  "profile.update": "actualizó su perfil",
  "profile.change_password": "cambió su contraseña",
  "profile.change_avatar": "cambió su avatar",
  "users.create": "creó un usuario",
  "users.update": "actualizó un usuario",
  "users.enable": "habilitó un usuario",
  "users.disable": "deshabilitó un usuario",
  "users.assign_branches": "cambió las sucursales asignadas a un usuario",
  "users.set_pin": "configuró su PIN de supervisor",
  "roles.create": "creó un rol",
  "roles.delete": "eliminó un rol",
  "roles.update_permissions": "actualizó los permisos de un rol",
  "branches.create": "creó una sucursal",
  "branches.update": "actualizó una sucursal",
  "branches.activate": "activó una sucursal",
  "branches.deactivate": "desactivó una sucursal",
  "products.create": "creó un producto",
  "products.update": "actualizó un producto",
  "products.activate": "activó un producto",
  "products.deactivate": "desactivó un producto",
  "products.images.upload": "subió una imagen de producto",
  "products.images.delete": "eliminó una imagen de producto",
  "products.images.set_primary": "cambió la imagen principal de un producto",
  "brands.create": "creó una marca",
  "brands.update": "actualizó una marca",
  "brands.activate": "activó una marca",
  "brands.deactivate": "desactivó una marca",
  "categories.create": "creó una categoría",
  "categories.update": "actualizó una categoría",
  "categories.activate": "activó una categoría",
  "categories.deactivate": "desactivó una categoría",
  "inventory.adjust": "ajustó manualmente el inventario",
  "inventoryCounts.create": "inició un conteo físico",
  "inventoryCounts.complete": "cerró un conteo físico",
  "inventoryCounts.cancel": "canceló un conteo físico",
  "transfers.create": "creó una transferencia entre sucursales",
  "transfers.receive": "recibió una transferencia",
  "transfers.cancel": "canceló una transferencia",
  "purchases.create": "registró una compra",
  "purchases.receive": "recibió una compra",
  "purchases.cancel": "canceló una compra",
  "suppliers.create": "registró un proveedor",
  "suppliers.update": "actualizó un proveedor",
  "sales.create": "registró una venta",
  "sales.cancel": "canceló una venta",
  "cash.open": "abrió un turno de caja",
  "cash.close": "cerró un turno de caja",
  "returns.create": "registró una devolución",
  "mermas.create": "registró una merma",
  "customers.create": "registró un cliente",
  "orders.create": "se recibió un pedido en línea",
  "orders.updateStatus": "actualizó el estado de un pedido",
  "orders.setEta": "actualizó el tiempo estimado de un pedido",
  "messages.send": "envió un mensaje",
  "settings.update": "actualizó la configuración de la empresa",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}


// Traduce las claves más comunes de los objetos de detalle que envía
// logAudit a una frase corta en español, en vez de mostrar JSON crudo.
// `changes`/`added`/`removed` se tratan aparte para listar qué CAMPOS
// cambiaron (no sus valores antes/después, que suelen ser objetos anidados
// poco legibles). Cualquier clave no cubierta aquí igual se muestra, como
// "clave: valor".
const DETAIL_KEY_LABELS: Record<string, string> = {
  folio: "Folio", total: "Total", itemCount: "Artículos", quantity: "Cantidad",
  reason: "Motivo", name: "Nombre", sku: "SKU", status: "Estado",
  openingFloat: "Fondo de apertura", estimatedReadyAt: "Tiempo estimado",
  firstName: "Nombre", lastName: "Apellido", phone: "Teléfono",
  style: "Estilo de avatar", adjustedLines: "Líneas ajustadas",
  totalCostImpact: "Impacto en costo", totalRetailImpact: "Impacto en precio de venta",
  discrepancyCount: "Diferencias encontradas", lines: "Líneas",
  closedByOwner: "Cerrada por su propio cajero",
  cardDifference: "Diferencia en tarjeta", cashDifference: "Diferencia en efectivo",
  systemCardTotal: "Tarjeta esperada por el sistema", systemCashTotal: "Efectivo esperado por el sistema",
  declaredCardTotal: "Tarjeta declarada", declaredCashTotal: "Efectivo declarado",
  requiredPermission: "Permiso requerido", supervisorId: "Supervisor",
};
const MONEY_KEYS = new Set([
  "total", "openingFloat", "totalCostImpact", "totalRetailImpact",
  "cardDifference", "cashDifference", "systemCardTotal", "systemCashTotal",
  "declaredCardTotal", "declaredCashTotal",
]);
import { currencyFormatter } from "../../utils/currency";

// Todos los valores de estado que pueden aparecer en un campo
// details.status/reason, traducidos para que se lean como texto y no
// como un código de base de datos.
const STATUS_VALUE_LABELS: Record<string, string> = {
  PENDING: "Pendiente", CONFIRMED: "Confirmado", PREPARING: "Preparando",
  READY: "Listo", COMPLETED: "Completada", CANCELLED: "Cancelada",
  OPEN: "Abierta", CLOSED: "Cerrada", CLOSED_WITH_DISCREPANCY: "Cerrada con diferencia",
  RECEIVED_WITH_DISCREPANCIES: "Recibida con diferencias",
  ACTIVE: "Activo", INACTIVE: "Inactivo",
};

function formatDetailValue(key: string, value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (MONEY_KEYS.has(key) && typeof value === "number") return currencyFormatter.format(value);
  if (typeof value === "string" && STATUS_VALUE_LABELS[value]) return STATUS_VALUE_LABELS[value];
  // Algunas claves llevan una fecha ISO en vez de un valor simple; se
  // muestran como fecha/hora localizada en lugar del ISO crudo.
  if (key === "estimatedReadyAt" && typeof value === "string") {
    return new Date(value).toLocaleString("es-MX");
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "ninguno";
    // Un arreglo de strings/números se puede unir con comas; uno de
    // OBJETOS (p. ej. las líneas de una compra) no tiene una
    // representación legible en una sola línea, así que solo se muestra
    // el conteo (evitando el ruido de "[object Object]").
    const isPrimitiveList = value.every((v) => typeof v !== "object" || v === null);
    if (isPrimitiveList) return value.map(String).join(", ");
    return String(value.length);
  }
  if (typeof value === "object") return "";
  return String(value);
}

function renderDetails(details: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const changedFieldSet = new Set<string>();
  if (details.changes && typeof details.changes === "object") {
    Object.keys(details.changes as object).forEach((k) => changedFieldSet.add(k));
  }
  if (Array.isArray(details.added) && details.added.length > 0) {
    lines.push(`Permisos agregados: ${(details.added as string[]).join(", ")}`);
  }
  if (Array.isArray(details.removed) && details.removed.length > 0) {
    lines.push(`Permisos quitados: ${(details.removed as string[]).join(", ")}`);
  }
  if (changedFieldSet.size > 0) {
    lines.push(`Campos modificados: ${Array.from(changedFieldSet).map((k) => DETAIL_KEY_LABELS[k] ?? k).join(", ")}`);
  }
  Object.entries(details).forEach(([key, value]) => {
    if (key === "changes" || key === "added" || key === "removed") return;
    // Omite ids crudos y arreglos de permisos ya resumidos arriba, para
    // no mostrar un UUID suelto o una lista de 40 permisos como ruido.
    if (/Id$/.test(key) || key === "permissions") return;
    const formatted = formatDetailValue(key, value);
    if (!formatted) return;
    lines.push(`${DETAIL_KEY_LABELS[key] ?? key}: ${formatted}`);
  });
  return lines;
}

export function AuditPage({ embedded = false }: { embedded?: boolean }) {
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
      // Una fecha "YYYY-MM-DD" sola se interpreta como medianoche UTC, lo
      // que excluiría eventos del mismo día "hasta". Se usa la misma
      // convención de fin de día inclusivo que el resto de la app.
      from: from ? `${from}T00:00:00.000` : undefined,
      to: to ? `${to}T23:59:59.999` : undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((res) => { setEntries(res.items); setTotal(res.total); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, [module, branchId, userId, from, to, page]);

  return (
    <div className="audit-page">
      {!embedded && <h1>Actividad reciente</h1>}

      <div className="audit-filters">
        <Select value={module} onChange={(e) => { setModule(e.target.value); setPage(1); }}>
          <option value="">Todos los módulos</option>
          {MODULES.map((m) => <option key={m} value={m}>{moduleLabel(m)}</option>)}
        </Select>
        <Select value={branchId} onChange={(e) => { setBranchId(e.target.value); setPage(1); }}>
          <option value="">Todas las sucursales</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </Select>
        <Select value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }}>
          <option value="">Todos los usuarios</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
        </Select>
        <DateRangePicker from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); setPage(1); }} />
      </div>

      {status === "loading" && <StatusState kind="loading" />}
      {status === "error" && <StatusState kind="error" message="No se pudo cargar la auditoría." />}
      {status === "ready" && entries?.length === 0 && <StatusState kind="empty" message="No hay eventos con estos filtros." />}

      {status === "ready" && entries && entries.length > 0 && (
        <ul className="audit-list">
          {entries.map((entry, i) => {
            const detailLines = entry.details ? renderDetails(entry.details as Record<string, unknown>) : [];
            return (
              <li key={entry.id} className="audit-item" style={{ animationDelay: `${Math.min(i, 8) * 30}ms` }}>
                {entry.user ? (
                  <Avatar avatarStyle={entry.user.avatarStyle} avatarSeed={entry.user.avatarSeed} displayName={entry.user.displayName} size="sm" />
                ) : (
                  <div className="audit-item__system-avatar" />
                )}
                <div>
                  <p>
                    <strong>{entry.user?.displayName ?? "El sistema"}</strong> {actionLabel(entry.action)}
                  </p>
                  <p className="audit-item__meta">
                    {moduleLabel(entry.module)}{entry.branch ? ` · ${entry.branch.name}` : ""} · {new Date(entry.createdAt).toLocaleString("es-MX")}
                  </p>
                  {detailLines.length > 0 && (
                    <p className="audit-item__details">{detailLines.join(" · ")}</p>
                  )}
                </div>
              </li>
            );
          })}
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
