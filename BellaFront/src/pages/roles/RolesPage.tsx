import { useEffect, useState } from "react";
import { StatusState } from "../../components/common/StatusState";
import { listRoles } from "../../services/roleService";
import type { Role } from "../../types/api";
import "./RolesPage.css";

export function RolesPage() {
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    listRoles()
      .then((r) => { setRoles(r); setStatus("ready"); })
      .catch(() => setStatus("error"));
  }, []);

  if (status === "loading") return <StatusState kind="loading" />;
  if (status === "error" || !roles) return <StatusState kind="error" message="No se pudieron cargar los roles." />;

  return (
    <div className="roles-page">
      <h1>Roles</h1>
      <div className="roles-grid">
        {roles.map((role, i) => (
          <article key={role.id} className="role-card" style={{ animationDelay: `${Math.min(i, 10) * 60}ms` }}>
            <header>
              <h2>{role.name}</h2>
              <span className="role-card__count">{role.assignedUsersCount} usuario{role.assignedUsersCount === 1 ? "" : "s"}</span>
            </header>
            <p className="role-card__description">{role.description}</p>
            <div className="role-card__permissions">
              {role.permissions.map((p) => <span key={p} className="role-card__permission">{p}</span>)}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
