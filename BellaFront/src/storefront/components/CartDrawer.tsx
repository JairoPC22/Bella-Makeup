import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { ArrowRight, Minus, Plus, ShoppingBag, Sparkles, Store, Trash2, X } from "lucide-react";
import { useCart } from "../CartContext";
import "./CartDrawer.css";

const currencyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

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

  useEffect(() => {
    if (!mounted) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  // Escape closes the drawer — it is a dialog, and previously the only way
  // out was the X or an overlay click.
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
               send someone back to the catalog, not a dead end. */
            <div className="cart-drawer__empty">
              <span className="cart-drawer__empty-icon">
                <Sparkles size={26} aria-hidden="true" />
              </span>
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
              {lines.map((line, index) => (
                <li
                  key={`${line.productId}::${line.variantId ?? ""}`}
                  className="cart-drawer__line animate-in-stagger"
                  style={{ "--stagger-delay": `${Math.min(index, 8) * 45}ms` } as CSSProperties}
                >
                  <div className="cart-drawer__line-thumb">
                    {line.imageUrl ? <img src={line.imageUrl} alt="" /> : <ShoppingBag size={20} aria-hidden="true" />}
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
                      {currencyFormatter.format(line.unitPrice * line.quantity)}
                    </p>
                    <div className="cart-drawer__stepper">
                      <button
                        type="button"
                        aria-label="Disminuir cantidad"
                        onClick={() => updateQuantity(line.productId, line.variantId, line.quantity - 1)}
                      >
                        <Minus size={13} />
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        type="button"
                        aria-label="Aumentar cantidad"
                        onClick={() => updateQuantity(line.productId, line.variantId, line.quantity + 1)}
                      >
                        <Plus size={13} />
                      </button>
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
                </li>
              ))}
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
              <strong>{currencyFormatter.format(subtotal)}</strong>
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
