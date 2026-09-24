import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export interface CartLine {
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  unitPrice: number;
  imageUrl: string | null;
  quantity: number;
}

interface CartContextValue {
  lines: CartLine[];
  itemCount: number;
  subtotal: number;
  addItem: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  removeItem: (productId: string, variantId?: string) => void;
  updateQuantity: (productId: string, variantId: string | undefined, quantity: number) => void;
  clearCart: () => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const STORAGE_KEY = "bellafront:storefront-cart";

// El storefront solo conoce un booleano `inStock` (types/api.ts), no el
// stock real, así que se limita la cantidad a un tope razonable; la
// disponibilidad real siempre se valida en el servidor al crear el pedido.
const MAX_LINE_QUANTITY = 99;

const CartContext = createContext<CartContextValue | null>(null);

function lineKey(productId: string, variantId?: string) {
  return `${productId}::${variantId ?? ""}`;
}

function loadInitialLines(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(() => loadInitialLines());
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // localStorage puede fallar (privado, cuota excedida); el carrito
      // sigue funcionando en memoria, solo no persiste al recargar.
    }
  }, [lines]);

  const addItem = useCallback((line: Omit<CartLine, "quantity">, quantity = 1) => {
    setLines((prev) => {
      const key = lineKey(line.productId, line.variantId);
      const existing = prev.find((l) => lineKey(l.productId, l.variantId) === key);
      if (existing) {
        return prev.map((l) =>
          lineKey(l.productId, l.variantId) === key
            ? { ...l, quantity: Math.min(l.quantity + quantity, MAX_LINE_QUANTITY) }
            : l
        );
      }
      return [...prev, { ...line, quantity: Math.min(quantity, MAX_LINE_QUANTITY) }];
    });
    setIsOpen(true);
  }, []);

  const removeItem = useCallback((productId: string, variantId?: string) => {
    const key = lineKey(productId, variantId);
    setLines((prev) => prev.filter((l) => lineKey(l.productId, l.variantId) !== key));
  }, []);

  const updateQuantity = useCallback((productId: string, variantId: string | undefined, quantity: number) => {
    const key = lineKey(productId, variantId);
    setLines((prev) => {
      if (quantity <= 0) return prev.filter((l) => lineKey(l.productId, l.variantId) !== key);
      const clamped = Math.min(quantity, MAX_LINE_QUANTITY);
      return prev.map((l) => (lineKey(l.productId, l.variantId) === key ? { ...l, quantity: clamped } : l));
    });
  }, []);

  const clearCart = useCallback(() => setLines([]), []);
  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const itemCount = useMemo(() => lines.reduce((sum, l) => sum + l.quantity, 0), [lines]);
  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0), [lines]);

  const value = useMemo<CartContextValue>(
    () => ({ lines, itemCount, subtotal, addItem, removeItem, updateQuantity, clearCart, isOpen, openCart, closeCart }),
    [lines, itemCount, subtotal, addItem, removeItem, updateQuantity, clearCart, isOpen, openCart, closeCart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
