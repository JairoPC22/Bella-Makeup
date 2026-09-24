import { useEffect } from "react";

// Bloquea el scroll del body mientras `active` es true y restaura el valor
// previo al desactivarse o desmontar. Estaba repetido de forma idéntica en
// Modal.tsx, CartDrawer.tsx y el menú móvil de StorefrontLayout.tsx.
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [active]);
}
