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
import { ProductsPage } from "../pages/products/ProductsPage";
import { InventoryPage } from "../pages/inventory/InventoryPage";
import { TransfersPage } from "../pages/transfers/TransfersPage";
import { PosPage } from "../pages/pos/PosPage";
import { SalesPage } from "../pages/sales/SalesPage";
import { CompanySettingsPage } from "../pages/settings/CompanySettingsPage";
import { AuditPage } from "../pages/audit/AuditPage";
import { MessagesPage } from "../pages/messages/MessagesPage";
import { AccessDeniedPage } from "../pages/errors/AccessDeniedPage";
import { CartProvider } from "../storefront/CartContext";
import { StorefrontLayout } from "../storefront/StorefrontLayout";
import { HomePage as StorefrontHomePage } from "../storefront/pages/HomePage";
import { CatalogPage as StorefrontCatalogPage } from "../storefront/pages/CatalogPage";
import { ProductDetailPage as StorefrontProductDetailPage } from "../storefront/pages/ProductDetailPage";
import { CheckoutPage as StorefrontCheckoutPage } from "../storefront/pages/CheckoutPage";
import { OrderConfirmationPage as StorefrontOrderConfirmationPage } from "../storefront/pages/OrderConfirmationPage";
import { AboutPage as StorefrontAboutPage } from "../storefront/pages/AboutPage";
import { FaqPage as StorefrontFaqPage } from "../storefront/pages/FaqPage";
import { ShippingPage as StorefrontShippingPage } from "../storefront/pages/ShippingPage";

function NotFoundPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <StatusState kind="empty" message="No encontramos esta página." />
      <Link to="/">Volver al inicio</Link>
    </div>
  );
}

export const router = createBrowserRouter([
  { path: "/admin/login", element: <LoginPage /> },
  // Public, unauthenticated storefront ("la tienda en línea") — now the
  // site's root, a sibling top-level route tree, NOT nested inside
  // ProtectedRoute/AppShell like the admin panel below. CartProvider wraps
  // StorefrontLayout so cart state is available to every storefront page
  // via its own <Outlet/>.
  {
    element: (
      <CartProvider>
        <StorefrontLayout />
      </CartProvider>
    ),
    children: [
      { path: "/", element: <StorefrontHomePage /> },
      { path: "/catalogo", element: <StorefrontCatalogPage /> },
      { path: "/producto/:id", element: <StorefrontProductDetailPage /> },
      { path: "/checkout", element: <StorefrontCheckoutPage /> },
      { path: "/pedido/:orderNumber", element: <StorefrontOrderConfirmationPage /> },
      { path: "/nosotros", element: <StorefrontAboutPage /> },
      { path: "/preguntas-frecuentes", element: <StorefrontFaqPage /> },
      { path: "/envios", element: <StorefrontShippingPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/admin", element: <DashboardPage /> },
          { path: "/admin/perfil", element: <ProfilePage /> },
          { path: "/admin/acceso-denegado", element: <AccessDeniedPage /> },
          {
            element: <PermissionRoute code="users.view" />,
            children: [{ path: "/admin/usuarios", element: <UsersPage /> }],
          },
          {
            element: <PermissionRoute code="roles.view" />,
            children: [{ path: "/admin/roles", element: <RolesPage /> }],
          },
          {
            element: <PermissionRoute code="branches.view" />,
            children: [{ path: "/admin/sucursales", element: <BranchesPage /> }],
          },
          {
            element: <PermissionRoute code="products.view" />,
            children: [{ path: "/admin/productos", element: <ProductsPage /> }],
          },
          {
            element: <PermissionRoute code="inventory.view" />,
            children: [{ path: "/admin/inventario", element: <InventoryPage /> }],
          },
          {
            element: <PermissionRoute code="transfers.view" />,
            children: [{ path: "/admin/transferencias", element: <TransfersPage /> }],
          },
          {
            element: <PermissionRoute code="sales.create" />,
            children: [{ path: "/admin/pos", element: <PosPage /> }],
          },
          {
            element: <PermissionRoute code="sales.view" />,
            children: [{ path: "/admin/ventas", element: <SalesPage /> }],
          },
          { path: "/admin/configuracion", element: <CompanySettingsPage /> },
          {
            element: <PermissionRoute code="audit.view" />,
            children: [{ path: "/admin/auditoria", element: <AuditPage /> }],
          },
          {
            element: <PermissionRoute code="messages.view" />,
            children: [{ path: "/admin/mensajes", element: <MessagesPage /> }],
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);
