import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { Avatar } from "../common/Avatar";
import "./UserMenu.css";

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on any click outside the menu (overlay/backdrop, not just its own
  // links) and on Escape, matching how every other dropdown/menu in the app
  // is expected to behave.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div className="user-menu" ref={rootRef}>
      <button className="user-menu__trigger" onClick={() => setOpen((o) => !o)}>
        <Avatar avatarStyle={user.avatarStyle} avatarSeed={user.avatarSeed} displayName={user.displayName} size="sm" />
        <span>{user.displayName}</span>
      </button>
      {open && (
        <div className="user-menu__dropdown">
          <Link to="/admin/perfil" onClick={() => setOpen(false)}><UserIcon size={16} /> Mi perfil</Link>
          <button onClick={() => logout()}><LogOut size={16} /> Cerrar sesión</button>
        </div>
      )}
    </div>
  );
}
