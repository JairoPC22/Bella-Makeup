import { useState } from "react";
import { Link } from "react-router-dom";
import { LogOut, User as UserIcon } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { Avatar } from "../common/Avatar";
import "./UserMenu.css";

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  return (
    <div className="user-menu">
      <button className="user-menu__trigger" onClick={() => setOpen((o) => !o)}>
        <Avatar avatarStyle={user.avatarStyle} avatarSeed={user.avatarSeed} displayName={user.displayName} size="sm" />
        <span>{user.displayName}</span>
      </button>
      {open && (
        <div className="user-menu__dropdown">
          <Link to="/perfil" onClick={() => setOpen(false)}><UserIcon size={16} /> Mi perfil</Link>
          <button onClick={() => logout()}><LogOut size={16} /> Cerrar sesión</button>
        </div>
      )}
    </div>
  );
}
