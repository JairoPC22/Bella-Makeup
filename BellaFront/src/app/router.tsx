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
import { PurchasesPage } from "../pages/purchases/PurchasesPage";
import { SuppliersPage } from "../pages/purchases/SuppliersPage";
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
import { LocationPage as StorefrontLocationPage } from "../storefront/pages/LocationPage";

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
      { path: "/ubicacion", element: <StorefrontLocationPage /> },
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
            element: <PermissionRoute code="purchases.view" />,
            children: [{ path: "/admin/compras", element: <PurchasesPage /> }],
          },
          // Proveedores has no sidebar entry (it's reached from the Compras
          // page) but still needs its own route-level gate: suppliers.manage
          // is strictly narrower than the purchases.view that gets you to
          // Compras, so without this anyone who could see purchases could
          // reach the supplier editor by typing the URL.
          {
            element: <PermissionRoute code="suppliers.manage" />,
            children: [{ path: "/admin/proveedores", element: <SuppliersPage /> }],
          },
          {
            element: <PermissionRoute code="sales.create" />,
            children: [{ path: "/admin/pos", element: <PosPage /> }],
          },
          {
            element: <PermissionRoute code="sales.view" />,
            children: [{ path: "/admin/ventas", element: <SalesPage /> }],
          },
          // Gated to match Sidebar.tsx's NAV_ITEMS entry for this same
          // path, which has always hidden "Configuración" behind
          // settings.manage. Without this route-level gate the sidebar
          // hiding was cosmetic only: any authenticated user (e.g. a
          // cashier) could still reach the full company-settings form by
          // typing the URL. The backend's PUT /api/company-settings is
          // already requirePermission("settings.manage"), so a save would
          // have 403'd — but the form still rendered and leaked company
          // data. Note the backend GET is deliberately requireAuth-only
          // (SaleReceipt.tsx needs company name/currency for every
          // cashier's printed ticket), so this gate has to live here.
          {
            element: <PermissionRoute code="settings.manage" />,
            children: [{ path: "/admin/configuracion", element: <CompanySettingsPage /> }],
          },
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
