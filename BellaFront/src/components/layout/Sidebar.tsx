import { NavLink } from "react-router-dom";
import { LayoutDashboard, Users, ShieldCheck, Building2, Settings, ScrollText } from "lucide-react";
import { PermissionGate } from "../auth/PermissionGate";

const linkClass = ({ isActive }: { isActive: boolean }) => `sidebar__link${isActive ? " sidebar__link--active" : ""}`;

export function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar__brand">Bella Makeup</div>
      <NavLink to="/" end className={linkClass}><LayoutDashboard size={18} /> Inicio</NavLink>
      <PermissionGate code="users.view">
        <NavLink to="/usuarios" className={linkClass}><Users size={18} /> Usuarios</NavLink>
      </PermissionGate>
      <PermissionGate code="roles.view">
        <NavLink to="/roles" className={linkClass}><ShieldCheck size={18} /> Roles</NavLink>
      </PermissionGate>
      <PermissionGate code="branches.view">
        <NavLink to="/sucursales" className={linkClass}><Building2 size={18} /> Sucursales</NavLink>
      </PermissionGate>
      <PermissionGate code="audit.view">
        <NavLink to="/auditoria" className={linkClass}><ScrollText size={18} /> Auditoría</NavLink>
      </PermissionGate>
      <PermissionGate code="settings.manage">
        <NavLink to="/configuracion" className={linkClass}><Settings size={18} /> Configuración</NavLink>
      </PermissionGate>
    </nav>
  );
}
