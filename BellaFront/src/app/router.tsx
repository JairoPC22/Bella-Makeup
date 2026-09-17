import { createBrowserRouter } from "react-router-dom";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { AppShell } from "../components/layout/AppShell";
import { LoginPage } from "../pages/auth/LoginPage";
import { ProfilePage } from "../pages/profile/ProfilePage";
import { UsersPage } from "../pages/users/UsersPage";
import { RolesPage } from "../pages/roles/RolesPage";
import { BranchesPage } from "../pages/branches/BranchesPage";
import { CompanySettingsPage } from "../pages/settings/CompanySettingsPage";
import { AuditPage } from "../pages/audit/AuditPage";

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <ProfilePage /> },
          { path: "/perfil", element: <ProfilePage /> },
          { path: "/usuarios", element: <UsersPage /> },
          { path: "/roles", element: <RolesPage /> },
          { path: "/sucursales", element: <BranchesPage /> },
          { path: "/configuracion", element: <CompanySettingsPage /> },
          { path: "/auditoria", element: <AuditPage /> },
        ],
      },
    ],
  },
]);
