import { Children, isValidElement, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
import "./Select.css";

/**
 * Dropdown totalmente personalizado que reemplaza a un `<select>` nativo.
 *
 * Un `<select>` nativo solo permite re-estilizar el control cerrado; la
 * lista de opciones abierta la dibuja el sistema operativo/navegador y no
 * se puede tematizar. Por eso este componente controla trigger y lista
 * como HTML/CSS normal.
 *
 * Mantiene la misma API externa que un `<select>` (`value`, `onChange` con
 * `e.target.value`, hijos `<option>`), para ser compatible con todos los
 * usos existentes en el código sin cambiarlos.
 *
 * La lista se porta a `document.body` (igual que Modal.tsx) y se posiciona
 * con `position: fixed` según el `getBoundingClientRect()` del trigger,
 * para evitar que el `overflow` de un contenedor (ej. el body de un modal)
 * recorte la lista. */

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

function extractOptions(children: ReactNode): SelectOption[] {
  const options: SelectOption[] = [];
  Children.toArray(children).forEach((child) => {
    if (!isValidElement(child) || child.type !== "option") return;
    const props = child.props as { value?: string; children?: ReactNode; disabled?: boolean };
    options.push({
      value: String(props.value ?? ""),
      label: typeof props.children === "string" || typeof props.children === "number" ? String(props.children) : "",
      disabled: props.disabled,
    });
  });
  return options;
}

export function Select({
  value,
  onChange,
  children,
  disabled,
  className,
}: {
  value: string;
  onChange: (event: { target: { value: string } }) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const options = useMemo(() => extractOptions(children), [children]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [listPos, setListPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      // La lista está portada a document.body, así que ya no es descendiente
      // de rootRef; hay que revisar también listRef para no cerrar el menú
      // antes de que el onClick de la opción llegue a dispararse.
      if (rootRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (open) setHighlighted(selectedIndex >= 0 ? selectedIndex : 0);
    // Solo reinicia el resaltado al abrir la lista, no en cada cambio de
    // valor/opciones mientras ya está abierta (para no chocar con las flechas).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector('[data-highlighted="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [open, highlighted]);

  // Posiciona la lista portada debajo (o arriba, si no hay espacio) del
  // trigger, en coordenadas de viewport. Se recalcula al abrir y se
  // mantiene sincronizada con un listener de scroll en fase de captura,
  // ya que el scroll de un descendiente (ej. el body de un modal) no burbujea.
  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const estimatedListHeight = Math.min(options.length * 36 + 8, 268);
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUpward = spaceBelow < estimatedListHeight && rect.top > spaceBelow;
      setListPos({
        top: openUpward ? rect.top - 6 - estimatedListHeight : rect.bottom + 6,
        left: rect.left,
        width: rect.width,
      });
    }
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, options.length]);

  function commit(index: number) {
    const opt = options[index];
    if (!opt || opt.disabled) return;
    onChange({ target: { value: opt.value } });
    setOpen(false);
  }

  function handleTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, options.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); return; }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); commit(highlighted); return; }
    if (e.key === "Tab") setOpen(false);
  }

  return (
    <div className={`select-wrapper${className ? ` ${className}` : ""}${disabled ? " select-wrapper--disabled" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="select-wrapper__trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        ref={triggerRef}
      >
        <span className="select-wrapper__value">{selected?.label ?? ""}</span>
        <ChevronDown className={`select-wrapper__chevron${open ? " is-open" : ""}`} size={16} aria-hidden="true" />
      </button>

      {open && listPos && createPortal(
        <ul
          className="select-wrapper__list"
          role="listbox"
          ref={listRef}
          style={{ position: "fixed", top: listPos.top, left: listPos.left, width: listPos.width }}
        >
          {options.map((opt, i) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              data-highlighted={i === highlighted ? "true" : undefined}
              className={`select-wrapper__option${i === highlighted ? " is-highlighted" : ""}${opt.value === value ? " is-selected" : ""}${opt.disabled ? " is-disabled" : ""}`}
              onMouseEnter={() => setHighlighted(i)}
              onClick={() => commit(i)}
            >
              <span>{opt.label}</span>
              {opt.value === value && <Check size={14} className="select-wrapper__check" />}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}
