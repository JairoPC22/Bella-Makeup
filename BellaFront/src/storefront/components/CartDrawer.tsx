import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useCart } from "../CartContext";
import { StatusState } from "../../components/common/StatusState";
import "./CartDrawer.css";

const currencyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

// Dedicated slide-over rather than adapting Modal.tsx — Modal.tsx's overlay
// centers a fixed-max-width card and animates via scale+opacity, which
// reads wrong for a cart (a cart drawer needs to anchor to the right edge
// and slide in horizontally, full-height). It reuses the same overlay
// fade + portal-under-body + scroll-lock + mount/unmount-after-transition
// conventions as Modal.tsx, just with a different panel transform.
export function CartDrawer() {
  const { lines, subtotal, isOpen, closeCart, removeItem, updateQuantity } = useCart();
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
          <h2>
            <ShoppingBag size={18} aria-hidden="true" /> Tu carrito
          </h2>
          <button onClick={closeCart} aria-label="Cerrar carrito">
            <X size={18} />
          </button>
        </div>

        <div className="cart-drawer__body">
          {lines.length === 0 ? (
            <StatusState kind="empty" message="Tu carrito está vacío por ahora." />
          ) : (
            <ul className="cart-drawer__lines">
              {lines.map((line) => (
                <li key={`${line.productId}::${line.variantId ?? ""}`} className="cart-drawer__line">
                  <div className="cart-drawer__line-thumb">
                    {line.imageUrl ? <img src={line.imageUrl} alt="" /> : <ShoppingBag size={20} aria-hidden="true" />}
                  </div>
                  <div className="cart-drawer__line-info">
                    <p className="cart-drawer__line-name">{line.name}</p>
                    <p className="cart-drawer__line-sku">{line.sku}</p>
                    <p className="cart-drawer__line-price">{currencyFormatter.format(line.unitPrice)}</p>
                  </div>
                  <div className="cart-drawer__line-actions">
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
                      <Trash2 size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {lines.length > 0 && (
          <div className="cart-drawer__footer">
            <div className="cart-drawer__subtotal">
              <span>Subtotal</span>
              <strong>{currencyFormatter.format(subtotal)}</strong>
            </div>
            <Link to="/checkout" className="cart-drawer__checkout" onClick={closeCart}>
              Continuar al pago
            </Link>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
