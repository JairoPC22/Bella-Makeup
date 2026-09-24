import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";
import "./AdminScrollTopButton.css";

const SHOW_AFTER_PX = 400;

// Replica el ScrollToTopButton de la tienda, pero qué elemento hace scroll
// realmente en el panel admin depende del viewport: en escritorio
// .app-shell__content es un <main> con scroll propio (sidebar/topbar quedan
// fijos), pero en móvil .app-shell cambia a flex-direction:column sin
// altura fija, por lo que ese contenedor crece con su contenido y es la
// VENTANA la que termina haciendo scroll. Escuchar y desplazar ambos, en
// vez de elegir uno, es lo que lo hace correcto en cualquier ancho sin
// necesidad de una rama específica por breakpoint.
export function AdminScrollTopButton({ containerRef }: { containerRef: React.RefObject<HTMLElement | null> }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    function handleScroll() {
      const containerTop = el?.scrollTop ?? 0;
      const windowTop = window.scrollY || document.documentElement.scrollTop || 0;
      setVisible(Math.max(containerTop, windowTop) > SHOW_AFTER_PX);
    }
    handleScroll();
    el?.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el?.removeEventListener("scroll", handleScroll);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [containerRef]);

  function handleClick() {
    containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <button
      type="button"
      className={`admin-scroll-top-button${visible ? " admin-scroll-top-button--visible" : ""}`}
      onClick={handleClick}
      aria-label="Volver arriba"
      tabIndex={visible ? 0 : -1}
    >
      <ArrowUp size={20} aria-hidden="true" />
    </button>
  );
}
