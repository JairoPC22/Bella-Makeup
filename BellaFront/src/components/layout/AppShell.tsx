import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import "./AppShell.css";

export function AppShell() {
  const location = useLocation();
  const contentRef = useRef<HTMLElement>(null);

  // The page scrolls inside .app-shell__content (the sidebar/topbar stay
  // fixed), not the window — so a plain "scroll window to top" fix
  // wouldn't do anything here. Without this, navigating away from a page
  // scrolled to the bottom lands the new page already scrolled down too,
  // since the browser has no reason to know a route change should reset
  // an inner scroll container.
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
    </div>
  );
}
