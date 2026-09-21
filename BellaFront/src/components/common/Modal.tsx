import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import "./Modal.css";

export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Optional extra class on the `.modal` card itself — e.g. to widen it
   * past the default 480px for content (like attachment previews) that
   * needs more room than a typical form modal. */
  className?: string;
}) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setMounted(true);
      rafRef.current = requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [open]);

  function handleOverlayTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (!open) setMounted(false);
  }

  // Close on Escape. The overlay click and the header's X button were the
  // only two ways out before this, which left every modal in the admin app
  // (product form, Kardex, inventory adjustment, user form, attachment
  // preview) ignoring the key users reach for first — and contradicted the
  // note in UserMenu.tsx that closing on Escape is "how every other
  // dropdown/menu in the app is expected to behave". Also what the
  // WAI-ARIA dialog pattern requires. Bound while mounted only, so a
  // closed modal never holds a listener.
  useEffect(() => {
    if (!mounted) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mounted, onClose]);

  // Lock background scroll while the modal is mounted so the page behind
  // it can't scroll independently of the modal's own internal scroll area.
  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  if (!mounted) return null;

  // Rendered via a portal directly under <body> so the overlay's
  // `position: fixed` is always relative to the real viewport. Any
  // ancestor with a CSS transform/animation (e.g. the page-transition
  // animation on .app-shell__page) would otherwise become the containing
  // block for a fixed-position descendant, shrinking/mispositioning the
  // overlay and cutting off the modal card.
  return createPortal(
    <div
      className={`modal-overlay${visible ? " modal-overlay--visible" : ""}`}
      onClick={onClose}
      onTransitionEnd={handleOverlayTransitionEnd}
    >
      <div
        className={`modal${visible ? " modal--visible" : ""}${className ? ` ${className}` : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
