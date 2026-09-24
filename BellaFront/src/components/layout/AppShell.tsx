import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { FloatingMessagesButton } from "./FloatingMessagesButton";
import { AdminScrollTopButton } from "./AdminScrollTopButton";
import "./AppShell.css";

export function AppShell() {
  const location = useLocation();
  const contentRef = useRef<HTMLElement>(null);

  // La página hace scroll dentro de .app-shell__content (sidebar/topbar
  // quedan fijos), no en la ventana, así que un simple "scroll window to
  // top" no serviría aquí. Sin esto, al navegar desde una página con scroll
  // hasta abajo, la nueva página aparecería ya desplazada, ya que el
  // navegador no tiene forma de saber que un cambio de ruta debe reiniciar
  // un contenedor de scroll interno.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [location.pathname]);

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__main">
        <Topbar />
        <main className="app-shell__content" ref={contentRef}>
          <div key={location.pathname} className="app-shell__page">
            <Outlet />
          </div>
        </main>
      </div>
      <FloatingMessagesButton />
      <AdminScrollTopButton containerRef={contentRef} />
    </div>
  );
}
