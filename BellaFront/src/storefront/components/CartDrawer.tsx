import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Minus, Plus, ShoppingBag, Sparkles, Store, Trash2, X } from "lucide-react";
import { useCart } from "../CartContext";
import { useScrollLock } from "../../hooks/useScrollLock";
import "./CartDrawer.css";

import { currencyFormatter } from "../../utils/currency";

function lineKey(productId: string, variantId?: string) {
  return `${productId}::${variantId ?? ""}`;
}

// Efecto tipo odómetro: al cambiar el valor, el número anterior se desliza
// hacia afuera y el nuevo entra (overflow: hidden en el CSS recorta el corte).
function RollingValue({ value, className }: { value: string; className?: string }) {
  return (
    <span className={`cart-drawer__roll${className ? ` ${className}` : ""}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// Dedicated slide-over rather than adapting Modal.tsx — Modal.tsx's overlay
// centers a fixed-max-width card and animates via scale+opacity, which
// reads wrong for a cart (a cart drawer needs to anchor to the right edge
// and slide in horizontally, full-height). It reuses the same overlay
// fade + portal-under-body + scroll-lock + mount/unmount-after-transition
// conventions as Modal.tsx, just with a different panel transform.
export function CartDrawer() {
  const { lines, subtotal, itemCount, isOpen, closeCart, removeItem, updateQuantity } = useCart();
  const [mounted, setMounted] = useState(isOpen);
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      rafRef.current = requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isOpen]);

  useScrollLock(mounted);

  // Escape también cierra el drawer (es un diálogo).
  useEffect(() => {
    if (!mounted) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeCart();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mounted, closeCart]);

  function handleOverlayTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (!isOpen) setMounted(false);
  }

  // Resalta la línea recién agregada con un pulso breve de fondo. Se
  // detecta comparando las llaves de `lines` contra la ejecución anterior.
  //
  // `prevKeysRef` arranca ya con las llaves del carrito restaurado de
  // localStorage (antes arrancaba vacío, así que la primera línea de un
  // carrito ya existente se marcaba como "recién agregada" sin serlo).
  //
  // El timer vive en su propio ref y siempre se limpia al inicio del
  // efecto, sin importar si esta corrida encontró una línea nueva o no
  // (antes solo se limpiaba dentro del `if`, así que cambiar la cantidad
  // de OTRA línea mientras el pulso seguía activo cancelaba el timer sin
  // programar uno nuevo, y el resaltado se quedaba pegado para siempre).
  const prevKeysRef = useRef<Set<string>>(new Set(lines.map((l) => lineKey(l.productId, l.variantId))));
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [justAddedKey, setJustAddedKey] = useState<string | null>(null);
  useEffect(() => {
    clearTimeout(highlightTimerRef.current);
    const currentKeys = new Set(lines.map((l) => lineKey(l.productId, l.variantId)));
    const prevKeys = prevKeysRef.current;
    const added = lines.find((l) => !prevKeys.has(lineKey(l.productId, l.variantId)));
    prevKeysRef.current = currentKeys;
    if (added) {
      setJustAddedKey(lineKey(added.productId, added.variantId));
      highlightTimerRef.current = setTimeout(() => setJustAddedKey(null), 1400);
    } else {
      setJustAddedKey(null);
    }
  }, [lines]);
  useEffect(() => () => clearTimeout(highlightTimerRef.current), []);

  if (!mounted) return null;

  return createPortal(
    <div
      className={`cart-drawer-overlay${visible ? " cart-drawer-overlay--visible" : ""}`}
      onClick={closeCart}
      onTransitionEnd={handleOverlayTransitionEnd}
    >
      <div
        className={`cart-drawer${visible ? " cart-drawer--visible" : ""}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Carrito de compras"
      >
        <div className="cart-drawer__header">
          <div className="cart-drawer__title">
            <h2>
              <ShoppingBag size={17} aria-hidden="true" /> Tu carrito
            </h2>
            {itemCount > 0 && (
              <span className="cart-drawer__count">
                {itemCount} {itemCount === 1 ? "artículo" : "artículos"}
              </span>
            )}
          </div>
          <button onClick={closeCart} aria-label="Cerrar carrito">
            <X size={18} />
          </button>
        </div>

        <div className="cart-drawer__body">
          {lines.length === 0 ? (
            /* Was a generic grey StatusState. An empty cart is a moment to
               send someone back to the catalog, not a dead end. The icon
               now idles with a slow float+glow instead of sitting inert —
               small, but it's the first thing a visitor sees if they open
               the cart before adding anything. */
            <div className="cart-drawer__empty">
              <motion.span
                className="cart-drawer__empty-icon"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
              >
                <Sparkles size={26} aria-hidden="true" />
              </motion.span>
              <p className="cart-drawer__empty-title">Tu carrito está vacío</p>
              <p className="cart-drawer__empty-text">
                Explora el catálogo y agrega tus productos favoritos para comenzar tu pedido.
              </p>
              <Link to="/catalogo" className="cart-drawer__empty-cta" onClick={closeCart}>
                Ver catálogo <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <ul className="cart-drawer__lines">
              <AnimatePresence initial={false}>
                {lines.map((line) => {
                  const key = lineKey(line.productId, line.variantId);
                  return (
                    <motion.li
                      key={key}
                      layout
                      className={`cart-drawer__line${justAddedKey === key ? " cart-drawer__line--added" : ""}`}
                      initial={{ opacity: 0, x: 28 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 28, height: 0, marginBottom: 0, paddingBottom: 0, borderBottomWidth: 0 }}
                      transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    >
                      <div className="cart-drawer__line-thumb">
                        {line.imageUrl ? <img src={line.imageUrl} alt="" loading="lazy" /> : <ShoppingBag size={20} aria-hidden="true" />}
                      </div>
                      <div className="cart-drawer__line-info">
                        <p className="cart-drawer__line-name">{line.name}</p>
                        <p className="cart-drawer__line-sku">{line.sku}</p>
                        <p className="cart-drawer__line-price">
                          {currencyFormatter.format(line.unitPrice)}
                          <span> c/u</span>
                        </p>
                      </div>
                      <div className="cart-drawer__line-actions">
                        <p className="cart-drawer__line-total">
                          <RollingValue value={currencyFormatter.format(line.unitPrice * line.quantity)} />
                        </p>
                        <div className="cart-drawer__stepper">
                          <motion.button
                            type="button"
                            aria-label="Disminuir cantidad"
                            whileTap={{ scale: 0.85 }}
                            onClick={() => updateQuantity(line.productId, line.variantId, line.quantity - 1)}
                          >
                            <Minus size={13} />
                          </motion.button>
                          <RollingValue value={String(line.quantity)} className="cart-drawer__stepper-value" />
                          <motion.button
                            type="button"
                            aria-label="Aumentar cantidad"
                            whileTap={{ scale: 0.85 }}
                            onClick={() => updateQuantity(line.productId, line.variantId, line.quantity + 1)}
                          >
                            <Plus size={13} />
                          </motion.button>
                        </div>
                        <button
                          type="button"
                          className="cart-drawer__remove"
                          aria-label="Quitar del carrito"
                          onClick={() => removeItem(line.productId, line.variantId)}
                        >
                          <Trash2 size={14} /> Quitar
                        </button>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>

        {lines.length > 0 && (
          <div className="cart-drawer__footer">
            <p className="cart-drawer__note">
              <Store size={13} aria-hidden="true" />
              Retiro gratis en sucursal · Pagas al recibir
            </p>
            <div className="cart-drawer__subtotal">
              <span>Subtotal</span>
              <strong><RollingValue value={currencyFormatter.format(subtotal)} /></strong>
            </div>
            <Link to="/checkout" className="cart-drawer__checkout" onClick={closeCart}>
              Continuar al pago <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <button type="button" className="cart-drawer__continue" onClick={closeCart}>
              Seguir comprando
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
