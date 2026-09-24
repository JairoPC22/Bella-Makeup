import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import "./DateRangePicker.css";

// Un calendario popover pequeño y sin dependencias para elegir un rango de
// fechas [from, to] — no se agregó ninguna librería de fechas/gráficos solo
// para esto. Los valores de entrada/salida son strings "YYYY-MM-DD" simples
// (el mismo formato que ya usa cada <input type="date"> en este código), así
// que los consumidores lo pueden usar sin cambiar cómo guardan/envían fechas.

const WEEKDAY_LABELS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toIso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fromIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}
// Índice de día de semana empezando en lunes (getDay() nativo empieza en domingo).
function mondayIndex(d: Date) {
  return (d.getDay() + 6) % 7;
}

function buildMonthGrid(monthStart: Date): (Date | null)[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = mondayIndex(new Date(year, month, 1));
  const cells: (Date | null)[] = Array(leadingBlanks).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = from ? fromIso(from) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  // Selección en borrador, que solo se confirma al padre al pulsar "Aplicar" —
  // así los clics en el calendario nunca disparan una solicitud por clic.
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function openPicker() {
    setDraftFrom(from);
    setDraftTo(to);
    const base = from ? fromIso(from) : new Date();
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setOpen(true);
  }

  function handleDayClick(iso: string) {
    // El primer clic (o un clic que reinicia el rango) empieza una nueva
    // selección; el siguiente clic cierra el rango en cualquier orden
    // (los dos valores se ordenan al aplicar).
    if (!draftFrom || (draftFrom && draftTo)) {
      setDraftFrom(iso);
      setDraftTo("");
    } else {
      setDraftTo(iso);
    }
  }

  function apply() {
    let a = draftFrom, b = draftTo || draftFrom;
    if (a && b && a > b) [a, b] = [b, a];
    onChange({ from: a, to: b });
    setOpen(false);
  }

  // Atajos rápidos, los mismos que BranchRevenueSection ya ofrecía como
  // botones tipo pill separados — integrados al propio picker para que
  // cualquier página que use DateRangePicker los obtenga gratis en vez de
  // tener que reimplementar su propia fila "Hoy/Ayer/Últimos 30 días".
  function applyPreset(days: number) {
    const today = new Date();
    const start = days === 0 ? today : addDays(today, -(days - 1));
    const a = toIso(start), b = toIso(today);
    setViewMonth(new Date(start.getFullYear(), start.getMonth(), 1));
    onChange({ from: a, to: b });
    setOpen(false);
  }
  function applyYesterday() {
    const y = addDays(new Date(), -1);
    const iso = toIso(y);
    setViewMonth(new Date(y.getFullYear(), y.getMonth(), 1));
    onChange({ from: iso, to: iso });
    setOpen(false);
  }
  function applyThisMonth() {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    setViewMonth(start);
    onChange({ from: toIso(start), to: toIso(today) });
    setOpen(false);
  }

  const grid = buildMonthGrid(viewMonth);
  const rangeStart = draftFrom && draftTo ? (draftFrom < draftTo ? draftFrom : draftTo) : draftFrom;
  const rangeEnd = draftFrom && draftTo ? (draftFrom < draftTo ? draftTo : draftFrom) : (hoverDate && draftFrom ? (draftFrom < hoverDate ? hoverDate : draftFrom) : draftFrom);
  const previewStart = draftFrom && !draftTo && hoverDate ? (draftFrom < hoverDate ? draftFrom : hoverDate) : rangeStart;
  const previewEnd = draftFrom && !draftTo && hoverDate ? (draftFrom < hoverDate ? hoverDate : draftFrom) : rangeEnd;

  const label = from && to
    ? (from === to ? fromIso(from).toLocaleDateString("es-MX", { day: "2-digit", month: "short" }) : `${fromIso(from).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })} – ${fromIso(to).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}`)
    : "Selecciona un rango";

  return (
    <div className="date-range-picker" ref={rootRef}>
      <button type="button" className="date-range-picker__trigger" onClick={() => (open ? setOpen(false) : openPicker())}>
        <CalendarRange size={15} />
        <span>{label}</span>
      </button>

      {open && (
        <div className="date-range-picker__popover" role="dialog" aria-label="Selecciona un rango de fechas">
          <div className="date-range-picker__presets">
            <button type="button" onClick={() => applyPreset(1)}>Hoy</button>
            <button type="button" onClick={applyYesterday}>Ayer</button>
            <button type="button" onClick={() => applyPreset(7)}>Últimos 7 días</button>
            <button type="button" onClick={() => applyPreset(30)}>Últimos 30 días</button>
            <button type="button" onClick={applyThisMonth}>Este mes</button>
          </div>

          <div className="date-range-picker__nav">
            <button type="button" onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} aria-label="Mes anterior">
              <ChevronLeft size={16} />
            </button>
            <span className="date-range-picker__month-label">{MONTH_LABELS[viewMonth.getMonth()]} {viewMonth.getFullYear()}</span>
            <button type="button" onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} aria-label="Mes siguiente">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="date-range-picker__weekdays">
            {WEEKDAY_LABELS.map((w) => <span key={w}>{w}</span>)}
          </div>

          <div className="date-range-picker__grid" onMouseLeave={() => setHoverDate(null)}>
            {grid.map((d, i) => {
              if (!d) return <span key={i} className="date-range-picker__cell date-range-picker__cell--blank" />;
              const iso = toIso(d);
              const isStart = iso === previewStart;
              const isEnd = iso === previewEnd;
              // Inclusivo de los propios extremos (a diferencia del chequeo
              // exclusivo anterior) para que la barra rosa del rango llegue
              // hasta el día de inicio/fin y se redondee ahí — un simple
              // fondo cuadrado por celda en los extremos dejaba una costura
              // visible donde el punto oscuro del extremo se encontraba con
              // el relleno claro del rango.
              const inRange = !!previewStart && !!previewEnd && iso >= previewStart && iso <= previewEnd;
              const isToday = iso === toIso(new Date());
              return (
                <button
                  key={iso}
                  type="button"
                  className={[
                    "date-range-picker__cell",
                    isStart ? "is-start" : "",
                    isEnd ? "is-end" : "",
                    inRange ? "is-in-range" : "",
                    isToday ? "is-today" : "",
                  ].filter(Boolean).join(" ")}
                  onClick={() => handleDayClick(iso)}
                  onMouseEnter={() => setHoverDate(iso)}
                >
                  {inRange && <span className="date-range-picker__range-bg" aria-hidden="true" />}
                  <span className="date-range-picker__day-label">{d.getDate()}</span>
                </button>
              );
            })}
          </div>

          <div className="date-range-picker__footer">
            <span className="date-range-picker__footer-hint">
              {draftFrom && !draftTo ? "Elige la fecha final" : draftFrom && draftTo ? `${draftFrom} a ${draftTo}` : "Elige la fecha inicial"}
            </span>
            <button type="button" className="date-range-picker__apply" onClick={apply} disabled={!draftFrom}>
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
