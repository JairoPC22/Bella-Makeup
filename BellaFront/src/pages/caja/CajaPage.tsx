import { useEffect, useMemo, useState } from "react";
import {
  Wallet,
  LockOpen,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  History,
} from "lucide-react";
import { Select } from "../../components/common/Select";
import { StatusState } from "../../components/common/StatusState";
import { Badge } from "../../components/common/Badge";
import { Modal } from "../../components/common/Modal";
import { DateRangePicker } from "../../components/common/DateRangePicker";
import { PermissionGate } from "../../components/auth/PermissionGate";
import { usePermission } from "../../hooks/usePermission";
import { useAuth } from "../../hooks/useAuth";
import { ApiError } from "../../services/apiClient";
import * as branchService from "../../services/branchService";
import * as cashSessionService from "../../services/cashSessionService";
import type { Branch, CashBreakdownLine, CashSession, CashSessionStatus } from "../../types/api";
import "./CajaPage.css";

import { currencyFormatter } from "../../utils/currency";

// Denominaciones fijas de MXN que un cajero puede tener: billetes primero
// (de mayor a menor), luego monedas. Cada fila se envía siempre al servidor
// aunque su conteo sea 0, para mantener el payload de cierre simple.
const DENOMINATIONS: { value: number; label: string; kind: "bill" | "coin" }[] = [
  { value: 1000, label: "$1,000", kind: "bill" },
  { value: 500, label: "$500", kind: "bill" },
  { value: 200, label: "$200", kind: "bill" },
  { value: 100, label: "$100", kind: "bill" },
  { value: 50, label: "$50", kind: "bill" },
  { value: 20, label: "$20", kind: "bill" },
  { value: 10, label: "$10", kind: "coin" },
  { value: 5, label: "$5", kind: "coin" },
  { value: 2, label: "$2", kind: "coin" },
  { value: 1, label: "$1", kind: "coin" },
];

const STATUS_LABELS: Record<CashSessionStatus, string> = {
  OPEN: "Abierta",
  CLOSED: "Cerrada",
  CLOSED_WITH_DISCREPANCY: "Cerrada con diferencia",
};

function statusTone(status: CashSessionStatus): "success" | "neutral" | "danger" {
  if (status === "OPEN") return "neutral";
  if (status === "CLOSED_WITH_DISCREPANCY") return "danger";
  return "success";
}

function emptyCounts(): Record<number, string> {
  const counts: Record<number, string> = {};
  DENOMINATIONS.forEach((d) => { counts[d.value] = ""; });
  return counts;
}

export function CajaPage() {
  const { user } = useAuth();
  const canManage = usePermission("cash.manage");

  // ---------- Contexto de sucursal (mismo patrón que PosPage.tsx) ----------
  const [branchOptions, setBranchOptions] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");

  useEffect(() => {
    if (!user) return;
    if (user.allBranches) {
      branchService
        .listBranches()
        .then((list) => {
          const active = list.filter((b) => b.status === "ACTIVE");
          setBranchOptions(active);
          setBranchId((prev) => prev || active[0]?.id || "");
        })
        .catch(() => {});
    } else {
      setBranchOptions(user.branches);
      setBranchId(user.branches[0]?.id ?? "");
    }
  }, [user]);

  const showBranchPicker = !!user?.allBranches || (user?.branches.length ?? 0) > 1;
  const selectedBranch = branchOptions.find((b) => b.id === branchId) ?? null;

  // ---------- Turno actual ----------
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [session, setSession] = useState<CashSession | null>(null);
  // El turno recién cerrado, se conserva tras el cierre para que el panel
  // de resultado siga visible aunque getCurrentSession ahora devuelva null.
  const [closedResult, setClosedResult] = useState<CashSession | null>(null);

  useEffect(() => {
    if (!branchId || !canManage) return;
    let cancelled = false;
    setSessionLoading(true);
    setSessionError(null);
    setClosedResult(null);
    cashSessionService
      .getCurrentSession(branchId)
      .then((s) => { if (!cancelled) setSession(s); })
      .catch((err) => {
        if (cancelled) return;
        setSessionError(err instanceof ApiError ? err.message : "No se pudo consultar el turno de caja.");
      })
      .finally(() => { if (!cancelled) setSessionLoading(false); });
    return () => { cancelled = true; };
  }, [branchId, canManage]);

  // ---------- Apertura de turno ----------
  const [openingFloat, setOpeningFloat] = useState("");
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  async function handleOpen() {
    if (!branchId || opening) return;
    setOpening(true);
    setOpenError(null);
    try {
      const created = await cashSessionService.openSession({
        branchId,
        openingFloat: Number(openingFloat) || 0,
      });
      setSession(created);
      setClosedResult(null);
      setOpeningFloat("");
    } catch (err) {
      setOpenError(err instanceof ApiError ? err.message : "No se pudo abrir la caja.");
    } finally {
      setOpening(false);
    }
  }

  // ---------- Cierre de turno (conteo ciego) ----------
  const [counts, setCounts] = useState<Record<number, string>>(emptyCounts());
  const [cardTotal, setCardTotal] = useState("");
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const declaredCashTotal = useMemo(
    () => DENOMINATIONS.reduce((sum, d) => sum + d.value * (parseInt(counts[d.value], 10) || 0), 0),
    [counts]
  );

  function updateCount(denomination: number, value: string) {
    setCounts((prev) => ({ ...prev, [denomination]: value }));
  }

  async function handleClose() {
    if (!session || closing) return;
    setClosing(true);
    setCloseError(null);
    try {
      const cashBreakdown: CashBreakdownLine[] = DENOMINATIONS.map((d) => ({
        denomination: d.value,
        count: Math.max(0, Math.floor(Number(counts[d.value]) || 0)),
      }));
      const closed = await cashSessionService.closeSession(session.id, {
        cashBreakdown,
        cardTotal: Number(cardTotal) || 0,
      });
      setClosedResult(closed);
      setSession(null);
      setCounts(emptyCounts());
      setCardTotal("");
    } catch (err) {
      setCloseError(err instanceof ApiError ? err.message : "No se pudo cerrar la caja.");
    } finally {
      setClosing(false);
    }
  }

  function startNextShift() {
    setClosedResult(null);
  }

  if (user && !user.allBranches && user.branches.length === 0) {
    return (
      <div className="caja-page">
        <StatusState kind="empty" message="No tienes ninguna sucursal asignada para manejar caja. Contacta a un administrador." />
      </div>
    );
  }

  return (
    <div className="caja-page">
      <div className="caja-page__header">
        <div className="caja-page__title">
          <Wallet size={22} />
          <h1>Caja</h1>
        </div>
        {showBranchPicker ? (
          <label className="caja-page__branch-picker">
            <span>Sucursal</span>
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </label>
        ) : selectedBranch ? (
          <p className="caja-page__branch-label">Sucursal: <strong>{selectedBranch.name}</strong></p>
        ) : null}
      </div>

      <PermissionGate
        code="cash.manage"
        fallback={
          <StatusState
            kind="error"
            message="No tienes permiso para manejar la caja de esta sucursal."
          />
        }
      >
        {sessionLoading && <StatusState kind="loading" message="Consultando turno de caja..." />}
        {!sessionLoading && sessionError && <StatusState kind="error" message={sessionError} />}

        {!sessionLoading && !sessionError && closedResult && (
          <CloseResultPanel session={closedResult} onNext={startNextShift} />
        )}

        {!sessionLoading && !sessionError && !closedResult && !session && branchId && (
          <OpenSessionCard
            openingFloat={openingFloat}
            setOpeningFloat={setOpeningFloat}
            onOpen={handleOpen}
            opening={opening}
            error={openError}
          />
        )}

        {!sessionLoading && !sessionError && !closedResult && session && (
          <OpenSessionStatus
            session={session}
            counts={counts}
            updateCount={updateCount}
            declaredCashTotal={declaredCashTotal}
            cardTotal={cardTotal}
            setCardTotal={setCardTotal}
            onClose={handleClose}
            closing={closing}
            error={closeError}
          />
        )}
      </PermissionGate>

      <PermissionGate code="cash.audit">
        <SessionHistory branchOptions={branchOptions} showBranchPicker={showBranchPicker} />
      </PermissionGate>
    </div>
  );
}

// ---------- Tarjeta de apertura de turno ----------

function OpenSessionCard({
  openingFloat,
  setOpeningFloat,
  onOpen,
  opening,
  error,
}: {
  openingFloat: string;
  setOpeningFloat: (v: string) => void;
  onOpen: () => void;
  opening: boolean;
  error: string | null;
}) {
  return (
    <section className="caja-card caja-open-card">
      <div className="caja-card__title">
        <LockOpen size={18} />
        <h2>Abrir caja</h2>
      </div>
      <p className="caja-card__hint">¿Con cuánto efectivo empiezas tu turno?</p>
      <label className="caja-field">
        <span>Fondo de apertura</span>
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="0.00"
          value={openingFloat}
          onChange={(e) => setOpeningFloat(e.target.value)}
          autoFocus
        />
      </label>
      {error && (
        <p className="caja-error"><AlertTriangle size={14} /> {error}</p>
      )}
      <button type="button" className="caja-btn caja-btn--primary" onClick={onOpen} disabled={opening}>
        {opening ? <Loader2 size={16} className="spin" /> : <LockOpen size={16} />}
        {opening ? "Abriendo..." : "Abrir caja"}
      </button>
    </section>
  );
}

// ---------- Estado de turno abierto + cierre (conteo ciego) ----------

function OpenSessionStatus({
  session,
  counts,
  updateCount,
  declaredCashTotal,
  cardTotal,
  setCardTotal,
  onClose,
  closing,
  error,
}: {
  session: CashSession;
  counts: Record<number, string>;
  updateCount: (denomination: number, value: string) => void;
  declaredCashTotal: number;
  cardTotal: string;
  setCardTotal: (v: string) => void;
  onClose: () => void;
  closing: boolean;
  error: string | null;
}) {
  return (
    <>
      <section className="caja-card caja-status-card">
        <div className="caja-card__title">
          <Lock size={18} />
          <h2>Caja abierta</h2>
        </div>
        <dl className="caja-status-grid">
          <div>
            <dt>Sucursal</dt>
            <dd>{session.branch.name}</dd>
          </div>
          <div>
            <dt>Cajero/a</dt>
            <dd>{session.user.displayName}</dd>
          </div>
          <div>
            <dt>Abierta desde</dt>
            <dd>{new Date(session.openedAt).toLocaleString("es-MX")}</dd>
          </div>
          <div>
            <dt>Fondo de apertura</dt>
            <dd>{currencyFormatter.format(Number(session.openingFloat))}</dd>
          </div>
        </dl>
      </section>

      <section className="caja-card caja-close-card">
        <div className="caja-card__title">
          <Wallet size={18} />
          <h2>Cerrar caja (conteo ciego)</h2>
        </div>
        <p className="caja-card__hint">
          Cuenta el efectivo físico en la caja y anota cuántos billetes/monedas de cada
          denominación tienes. No se te mostrará el total esperado por el sistema hasta que
          termines.
        </p>

        <div className="caja-denominations">
          {DENOMINATIONS.map((d) => (
            <label key={d.value} className={`caja-denomination caja-denomination--${d.kind}`}>
              <span>{d.label}</span>
              <input
                type="number"
                min={0}
                step={1}
                placeholder="0"
                value={counts[d.value]}
                onChange={(e) => updateCount(d.value, e.target.value)}
              />
            </label>
          ))}
        </div>

        <div className="caja-declared-total">
          <span>Tu total contado en efectivo</span>
          <strong>{currencyFormatter.format(declaredCashTotal)}</strong>
        </div>

        <label className="caja-field">
          <span>Total cobrado con tarjeta</span>
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="0.00"
            value={cardTotal}
            onChange={(e) => setCardTotal(e.target.value)}
          />
        </label>

        {error && (
          <p className="caja-error"><AlertTriangle size={14} /> {error}</p>
        )}

        <button type="button" className="caja-btn caja-btn--primary" onClick={onClose} disabled={closing}>
          {closing ? <Loader2 size={16} className="spin" /> : <Lock size={16} />}
          {closing ? "Cerrando..." : "Cerrar caja"}
        </button>
      </section>
    </>
  );
}

// ---------- Resultado del cierre ----------

function CloseResultPanel({ session, onNext }: { session: CashSession; onNext: () => void }) {
  // Se usa `in` (no `!= null`) porque una diferencia de exactamente "0.00"
  // es un string válido pero falsy que igual debe mostrarse como "coincide".
  const hasReveal =
    "systemCashTotal" in session &&
    "systemCardTotal" in session &&
    "cashDifference" in session &&
    "cardDifference" in session;

  const cashDifference = hasReveal ? Number(session.cashDifference) : null;
  const cardDifference = hasReveal ? Number(session.cardDifference) : null;
  const exact = cashDifference === 0 && cardDifference === 0;

  return (
    <section className="caja-card caja-result-card">
      <div className="caja-card__title">
        {exact ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
        <h2>Resultado del cierre</h2>
      </div>

      {!hasReveal ? (
        <StatusState kind="error" compact message="No se recibió el resultado del cierre." />
      ) : (
        <>
          <table className="caja-result-table">
            <thead>
              <tr>
                <th></th>
                <th>Tu conteo</th>
                <th>Sistema</th>
                <th>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Efectivo</td>
                <td>{currencyFormatter.format(Number(session.declaredCashTotal))}</td>
                <td>{currencyFormatter.format(Number(session.systemCashTotal))}</td>
                <td className={cashDifference !== 0 ? "caja-result-table__diff" : undefined}>
                  {currencyFormatter.format(cashDifference ?? 0)}
                </td>
              </tr>
              <tr>
                <td>Tarjeta</td>
                <td>{currencyFormatter.format(Number(session.declaredCardTotal))}</td>
                <td>{currencyFormatter.format(Number(session.systemCardTotal))}</td>
                <td className={cardDifference !== 0 ? "caja-result-table__diff" : undefined}>
                  {currencyFormatter.format(cardDifference ?? 0)}
                </td>
              </tr>
            </tbody>
          </table>

          {exact ? (
            <p className="caja-result-status caja-result-status--exact">
              <CheckCircle2 size={16} /> Cuadró exacto
            </p>
          ) : (
            <p className="caja-result-status caja-result-status--warning">
              <AlertTriangle size={16} />
              Hay una diferencia de {currencyFormatter.format(Math.abs((cashDifference ?? 0) + (cardDifference ?? 0)))}
            </p>
          )}
        </>
      )}

      <button type="button" className="caja-btn caja-btn--primary" onClick={onNext}>
        <LockOpen size={16} /> Iniciar siguiente turno
      </button>
    </section>
  );
}

// ---------- Historial de turnos (cash.audit) ----------

function SessionHistory({
  branchOptions,
  showBranchPicker,
}: {
  branchOptions: Branch[];
  showBranchPicker: boolean;
}) {
  const [allBranches, setAllBranches] = useState<Branch[]>(branchOptions);
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState<CashSessionStatus | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sessions, setSessions] = useState<CashSession[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CashSession | null>(null);

  // Auditoría puede ver todas las sucursales, así que esta sección obtiene
  // su propia lista completa en vez de depender solo de las opciones (tal
  // vez limitadas) que pasa el padre.
  useEffect(() => {
    if (branchOptions.length > 0) { setAllBranches(branchOptions); return; }
    branchService.listBranches().then((list) => setAllBranches(list.filter((b) => b.status === "ACTIVE"))).catch(() => {});
  }, [branchOptions]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    cashSessionService
      .listSessions({
        branchId: branchId || undefined,
        status: status || undefined,
        // "YYYY-MM-DD" a secas se interpretaría como medianoche UTC en ambos
        // extremos, excluyendo turnos abiertos más tarde ese mismo día.
        // Se fuerza a fin de día en "to", igual que en las demás páginas.
        from: from ? `${from}T00:00:00.000` : undefined,
        to: to ? `${to}T23:59:59.999` : undefined,
      })
      .then(setSessions)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar el historial de turnos."))
      .finally(() => setLoading(false));
  }, [branchId, status, from, to]);

  return (
    <section className="caja-card caja-history-card">
      <div className="caja-card__title">
        <History size={18} />
        <h2>Historial de turnos</h2>
      </div>

      <div className="caja-history__filters">
        {(showBranchPicker || allBranches.length > 1) && (
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Todas las sucursales</option>
            {allBranches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        )}
        <Select value={status} onChange={(e) => setStatus(e.target.value as CashSessionStatus | "")}>
          <option value="">Todos los estados</option>
          <option value="OPEN">Abierta</option>
          <option value="CLOSED">Cerrada</option>
          <option value="CLOSED_WITH_DISCREPANCY">Cerrada con diferencia</option>
        </Select>
        <DateRangePicker from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); }} />
      </div>

      {loading && <StatusState kind="loading" compact />}
      {!loading && error && <StatusState kind="error" compact message={error} />}
      {!loading && !error && sessions && sessions.length === 0 && (
        <StatusState kind="empty" compact message="No hay turnos con estos filtros." />
      )}

      {!loading && !error && sessions && sessions.length > 0 && (
        <div className="caja-history__table-wrap">
          <table className="caja-history__table">
            <thead>
              <tr>
                <th>Sucursal</th>
                <th>Cajero/a</th>
                <th>Abierta</th>
                <th>Cerrada</th>
                <th>Estado</th>
                <th>Total sistema (efectivo)</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="caja-history__row" onClick={() => setDetail(s)}>
                  <td>{s.branch.name}</td>
                  <td>{s.user.displayName}</td>
                  <td>{new Date(s.openedAt).toLocaleString("es-MX")}</td>
                  <td>{s.closedAt ? new Date(s.closedAt).toLocaleString("es-MX") : "—"}</td>
                  <td><Badge tone={statusTone(s.status)}>{STATUS_LABELS[s.status]}</Badge></td>
                  <td>{s.systemCashTotal != null ? currencyFormatter.format(Number(s.systemCashTotal)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Detalle del turno">
        {detail && <SessionDetail session={detail} />}
      </Modal>
    </section>
  );
}

function SessionDetail({ session }: { session: CashSession }) {
  const hasReveal = "systemCashTotal" in session;
  return (
    <div className="caja-detail">
      <dl className="caja-status-grid">
        <div><dt>Sucursal</dt><dd>{session.branch.name}</dd></div>
        <div><dt>Cajero/a</dt><dd>{session.user.displayName}</dd></div>
        <div><dt>Estado</dt><dd><Badge tone={statusTone(session.status)}>{STATUS_LABELS[session.status]}</Badge></dd></div>
        <div><dt>Abierta</dt><dd>{new Date(session.openedAt).toLocaleString("es-MX")}</dd></div>
        <div><dt>Cerrada</dt><dd>{session.closedAt ? new Date(session.closedAt).toLocaleString("es-MX") : "—"}</dd></div>
        <div><dt>Fondo de apertura</dt><dd>{currencyFormatter.format(Number(session.openingFloat))}</dd></div>
      </dl>
      {hasReveal ? (
        <table className="caja-result-table">
          <thead>
            <tr><th></th><th>Declarado</th><th>Sistema</th><th>Diferencia</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Efectivo</td>
              <td>{session.declaredCashTotal != null ? currencyFormatter.format(Number(session.declaredCashTotal)) : "—"}</td>
              <td>{currencyFormatter.format(Number(session.systemCashTotal))}</td>
              <td>{currencyFormatter.format(Number(session.cashDifference))}</td>
            </tr>
            <tr>
              <td>Tarjeta</td>
              <td>{session.declaredCardTotal != null ? currencyFormatter.format(Number(session.declaredCardTotal)) : "—"}</td>
              <td>{currencyFormatter.format(Number(session.systemCardTotal))}</td>
              <td>{currencyFormatter.format(Number(session.cardDifference))}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="caja-card__hint">Este turno sigue abierto; el sistema aún no revela los totales esperados.</p>
      )}
    </div>
  );
}
