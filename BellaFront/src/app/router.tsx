import { createBrowserRouter, Navigate, useLocation, useRouteError } from "react-router-dom";
import { SearchX, AlertTriangle } from "lucide-react";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { PermissionRoute } from "../components/auth/PermissionRoute";
import { AppShell } from "../components/layout/AppShell";
import { LoginPage } from "../pages/auth/LoginPage";
import { DashboardPage } from "../pages/dashboard/DashboardPage";
import { ProfilePage } from "../pages/profile/ProfilePage";
import { BranchesPage } from "../pages/branches/BranchesPage";
import { ProductsPage } from "../pages/products/ProductsPage";
import { InventoryPage } from "../pages/inventory/InventoryPage";
import { TransfersPage } from "../pages/transfers/TransfersPage";
import { PurchasesPage } from "../pages/purchases/PurchasesPage";
import { SuppliersPage } from "../pages/purchases/SuppliersPage";
import { PosPage } from "../pages/pos/PosPage";
import { SalesPage } from "../pages/sales/SalesPage";
import { CajaPage } from "../pages/caja/CajaPage";
import { MermasPage } from "../pages/mermas/MermasPage";
import { InventoryCountsPage } from "../pages/inventory-counts/InventoryCountsPage";
import { OrdersPage } from "../pages/orders/OrdersPage";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { AuditPage } from "../pages/audit/AuditPage";
import { MessagesPage } from "../pages/messages/MessagesPage";
import { AccessDeniedPage } from "../pages/errors/AccessDeniedPage";
import { ErrorPage } from "../pages/errors/ErrorPage";
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

// Esta ruta vive en el nivel superior, fuera de AppShell y de
// StorefrontLayout (debe atrapar URLs rotas de ambos lados). El enlace de
// "volver" es contextual: una URL /admin/... rota devuelve al usuario admin
// al dashboard; cualquier otra devuelve al visitante de la tienda al inicio.
function NotFoundPage() {
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith("/admin");
  return (
    <ErrorPage
      code="404"
      icon={SearchX}
      title="Esta página no existe"
      message="El enlace que seguiste puede estar roto o la página pudo haberse movido. Revisa la dirección o vuelve al inicio."
      linkTo={isAdminPath ? "/admin" : "/"}
      linkLabel={isAdminPath ? "Volver al panel" : "Volver a la tienda"}
    />
  );
}

// `errorElement` de React Router actúa como error boundary real para la
// rama de rutas a la que está asociado (no solo errores de loaders, también
// captura excepciones al renderizar). Se define en ambas ramas de nivel
// superior para evitar que el usuario quede varado en una pantalla en
// blanco. Reutiliza el mismo tratamiento visual que las rutas 404/403.
function RouteCrashPage() {
  const error = useRouteError();
  const location = useLocation();
  const isAdminPath = location.pathname.startsWith("/admin");
  if (import.meta.env.DEV) console.error("Route crashed:", error);
  return (
    <ErrorPage
      code="Error"
      icon={AlertTriangle}
      title="Algo salió mal"
      message="Ocurrió un error inesperado al cargar esta página. Intenta recargar o vuelve al inicio."
      linkTo={isAdminPath ? "/admin" : "/"}
      linkLabel={isAdminPath ? "Volver al panel" : "Volver a la tienda"}
    />
  );
}

export const router = createBrowserRouter([
  { path: "/admin/login", element: <LoginPage />, errorElement: <RouteCrashPage /> },
  // Tienda en línea pública y sin autenticación — es la raíz del sitio, un
  // árbol de rutas independiente, NO anidado dentro de ProtectedRoute/
  // AppShell como el panel de administración de abajo. CartProvider envuelve
  // a StorefrontLayout para que el estado del carrito esté disponible en
  // todas las páginas de la tienda a través de su propio <Outlet/>.
  {
    element: (
      <CartProvider>
        <StorefrontLayout />
      </CartProvider>
    ),
    errorElement: <RouteCrashPage />,
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
    errorElement: <RouteCrashPage />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: "/admin", element: <DashboardPage /> },
          { path: "/admin/perfil", element: <ProfilePage /> },
          { path: "/admin/acceso-denegado", element: <AccessDeniedPage /> },
          // Usuarios y Roles se movieron a Configuración como pestañas;
          // estas dos rutas ahora solo redirigen cualquier marcador o enlace
          // antiguo a la pestaña correspondiente en vez de tener su propia página.
          { path: "/admin/usuarios", element: <Navigate to="/admin/configuracion?tab=usuarios" replace /> },
          { path: "/admin/roles", element: <Navigate to="/admin/configuracion?tab=roles" replace /> },
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
          // Proveedores no tiene entrada en el sidebar (se llega desde
          // Compras) pero igual necesita su propio guard de ruta:
          // suppliers.manage es más restrictivo que purchases.view, así que
          // sin esto cualquiera con acceso a Compras podría llegar al editor
          // de proveedores escribiendo la URL directamente.
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
          // Un cajero abre/cierra SU PROPIA caja (cash.manage); un gerente
          // solo audita turnos ajenos (cash.audit) sin operar caja. Cualquiera
          // de los dos permisos basta para acceder a esta ruta.
          {
            element: <PermissionRoute anyOf={["cash.manage", "cash.audit"]} />,
            children: [{ path: "/admin/caja", element: <CajaPage /> }],
          },
          {
            element: <PermissionRoute code="shrinkage.view" />,
            children: [{ path: "/admin/mermas", element: <MermasPage /> }],
          },
          {
            element: <PermissionRoute code="inventory.count" />,
            children: [{ path: "/admin/inventarios-fisicos", element: <InventoryCountsPage /> }],
          },
          {
            element: <PermissionRoute code="orders.view" />,
            children: [{ path: "/admin/pedidos", element: <OrdersPage /> }],
          },
          // Configuración también aloja Usuarios/Roles/Actividad como
          // pestañas; SettingsPage oculta las pestañas/contenido para los
          // que el usuario no tiene permiso (los endpoints del backend
          // siguen validando permisos de forma independiente). No hay guard
          // de permiso a nivel de ruta a propósito: todo usuario autenticado
          // siempre tiene la pestaña "Mi perfil", así que ninguna
          // combinación de permisos debería bloquear la ruta por completo.
          { path: "/admin/configuracion", element: <SettingsPage /> },
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
