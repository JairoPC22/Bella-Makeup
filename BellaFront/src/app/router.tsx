import { createBrowserRouter, Link } from "react-router-dom";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { PermissionRoute } from "../components/auth/PermissionRoute";
import { AppShell } from "../components/layout/AppShell";
import { StatusState } from "../components/common/StatusState";
import { LoginPage } from "../pages/auth/LoginPage";
import { DashboardPage } from "../pages/dashboard/DashboardPage";
import { ProfilePage } from "../pages/profile/ProfilePage";
import { UsersPage } from "../pages/users/UsersPage";
import { RolesPage } from "../pages/roles/RolesPage";
import { BranchesPage } from "../pages/branches/BranchesPage";
import { CompanySettingsPage } from "../pages/settings/CompanySettingsPage";
import { AuditPage } from "../pages/audit/AuditPage";
import { MessagesPage } from "../pages/messages/MessagesPage";
import { AccessDeniedPage } from "../pages/errors/AccessDeniedPage";

function NotFoundPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <StatusState kind="empty" message="No encontramos esta página." />
      <Link to="/">Volver al inicio</Link>
    </div>
  );
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <DashboardPage /> },
          { path: "/perfil", element: <ProfilePage /> },
          { path: "/acceso-denegado", element: <AccessDeniedPage /> },
          {
            element: <PermissionRoute code="users.view" />,
            children: [{ path: "/usuarios", element: <UsersPage /> }],
          },
          {
            element: <PermissionRoute code="roles.view" />,
            children: [{ path: "/roles", element: <RolesPage /> }],
          },
          {
            element: <PermissionRoute code="branches.view" />,
            children: [{ path: "/sucursales", element: <BranchesPage /> }],
          },
          { path: "/configuracion", element: <CompanySettingsPage /> },
          {
            element: <PermissionRoute code="audit.view" />,
            children: [{ path: "/auditoria", element: <AuditPage /> }],
          },
          {
            element: <PermissionRoute code="messages.view" />,
            children: [{ path: "/mensajes", element: <MessagesPage /> }],
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
