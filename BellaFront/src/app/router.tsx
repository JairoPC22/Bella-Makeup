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
  { path: "/login", element: <LoginPage /> },
  // Public, unauthenticated storefront ("la tienda en línea") — a sibling
  // top-level route tree, NOT nested inside ProtectedRoute/AppShell like
  // everything below. CartProvider wraps StorefrontLayout so cart state is
  // available to every storefront page via its own <Outlet/>.
  {
    element: (
      <CartProvider>
        <StorefrontLayout />
      </CartProvider>
    ),
    children: [
      { path: "/tienda", element: <StorefrontHomePage /> },
      { path: "/tienda/catalogo", element: <StorefrontCatalogPage /> },
      { path: "/tienda/producto/:id", element: <StorefrontProductDetailPage /> },
      { path: "/tienda/checkout", element: <StorefrontCheckoutPage /> },
      { path: "/tienda/pedido/:orderNumber", element: <StorefrontOrderConfirmationPage /> },
      { path: "/tienda/nosotros", element: <StorefrontAboutPage /> },
      { path: "/tienda/preguntas-frecuentes", element: <StorefrontFaqPage /> },
      { path: "/tienda/envios", element: <StorefrontShippingPage /> },
    ],
  },
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
          {
            element: <PermissionRoute code="products.view" />,
            children: [{ path: "/productos", element: <ProductsPage /> }],
          },
          {
            element: <PermissionRoute code="inventory.view" />,
            children: [{ path: "/inventario", element: <InventoryPage /> }],
          },
          {
            element: <PermissionRoute code="transfers.view" />,
            children: [{ path: "/transferencias", element: <TransfersPage /> }],
          },
          {
            element: <PermissionRoute code="sales.create" />,
            children: [{ path: "/pos", element: <PosPage /> }],
          },
          {
            element: <PermissionRoute code="sales.view" />,
            children: [{ path: "/ventas", element: <SalesPage /> }],
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
