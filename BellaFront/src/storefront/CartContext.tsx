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
      // localStorage can throw in private-browsing/quota-exceeded edge
      // cases — the cart still works in-memory for the rest of the
      // session, it just won't survive a refresh. Not worth surfacing.
    }
  }, [lines]);

  const addItem = useCallback((line: Omit<CartLine, "quantity">, quantity = 1) => {
    setLines((prev) => {
      const key = lineKey(line.productId, line.variantId);
      const existing = prev.find((l) => lineKey(l.productId, l.variantId) === key);
      if (existing) {
        return prev.map((l) =>
          lineKey(l.productId, l.variantId) === key ? { ...l, quantity: l.quantity + quantity } : l
        );
      }
      return [...prev, { ...line, quantity }];
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
      return prev.map((l) => (lineKey(l.productId, l.variantId) === key ? { ...l, quantity } : l));
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
