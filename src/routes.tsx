import { lazy, Suspense, type ComponentType } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { AdminLayout } from '@/components/layout/admin-layout'
import { ShopLayout } from '@/components/layout/shop-layout'
import { CustomerLayout } from '@/components/layout/customer-layout'
import { ProtectedRoute } from '@/components/layout/protected-route'
import { AdminGuard } from '@/components/layout/admin-only-route'
import { RouteLoading } from '@/components/layout/route-loading'

// Lazy-loaded page components
const LoginPage = lazy(() => import('@/pages/admin/login'))
const DashboardPage = lazy(() => import('@/pages/admin/dashboard'))
const ItemListPage = lazy(() => import('@/pages/admin/items'))
const BulkIntakePage = lazy(() => import('@/pages/admin/bulk-intake'))
const ItemDetailPage = lazy(() => import('@/pages/admin/item-detail'))
const QRScannerPage = lazy(() => import('@/pages/admin/qr-scanner'))
const InspectionQueuePage = lazy(() => import('@/pages/admin/inspection-queue'))
const InspectItemPage = lazy(() => import('@/pages/admin/inspect-item'))
const ProductListPage = lazy(() => import('@/pages/admin/products'))
const ProductDetailPage = lazy(() => import('@/pages/admin/product-detail'))
const SupplierListPage = lazy(() => import('@/pages/admin/suppliers'))
const KaitoriListPage = lazy(() => import('@/pages/admin/kaitori'))
const KaitoriDetailPage = lazy(() => import('@/pages/admin/kaitori-detail'))
const KaitoriPriceListPage = lazy(() => import('@/pages/admin/kaitori-price-list'))
const SellGroupListPage = lazy(() => import('@/pages/admin/sell-groups'))
const SellGroupDetailPage = lazy(() => import('@/pages/admin/sell-group-detail'))
const OrderListPage = lazy(() => import('@/pages/admin/orders'))
const OrderDetailPage = lazy(() => import('@/pages/admin/order-detail'))
const OfferDetailPage = lazy(() => import('@/pages/admin/offer-detail'))
const CreateOrderPage = lazy(() => import('@/pages/admin/create-order'))
const PackingStationPage = lazy(() => import('@/pages/admin/packing-station'))
const CustomerListPage = lazy(() => import('@/pages/admin/customers'))
const CustomerDetailPage = lazy(() => import('@/pages/admin/customer-detail'))
const ReportsPage = lazy(() => import('@/pages/admin/reports'))
const ReceivingReportsPage = lazy(() => import('@/pages/admin/receiving-reports'))
const ReceivingReportDetailPage = lazy(() => import('@/pages/admin/receiving-report-detail'))
const CategoriesPage = lazy(() => import('@/pages/admin/categories'))
const GeneralSettingsPage = lazy(() => import('@/pages/admin/general-settings'))
const AiSettingsPage = lazy(() => import('@/pages/admin/ai-settings'))
const ItemsColumnSettingsPage = lazy(() => import('@/pages/admin/items-column-settings'))
const PostalCodesPage = lazy(() => import('@/pages/admin/postal-codes'))
const MediaStudioPage = lazy(() => import('@/pages/admin/media-studio'))
const OfferClaimPage = lazy(() => import('@/pages/offer/claim'))
const ShopBrowsePage = lazy(() => import('@/pages/shop/browse'))
const ShopProductDetailPage = lazy(() => import('@/pages/shop/product-detail'))
const ShopItemDetailPage = lazy(() => import('@/pages/shop/item-detail'))
const CheckoutPage = lazy(() => import('@/pages/shop/checkout'))
const KaitoriLandingPage = lazy(() => import('@/pages/kaitori/landing'))
const KaitoriAssessPage = lazy(() => import('@/pages/kaitori/assess'))
const KaitoriStatusPage = lazy(() => import('@/pages/kaitori/status'))
const CustomerLoginPage = lazy(() => import('@/pages/customer/login'))
const CustomerRegisterPage = lazy(() => import('@/pages/customer/register'))
const CustomerDashboardPage = lazy(() => import('@/pages/customer/dashboard'))
const CustomerOrdersPage = lazy(() => import('@/pages/customer/orders'))
const CustomerOrderDetailPage = lazy(() => import('@/pages/customer/order-detail'))
const CustomerKaitoriPage = lazy(() => import('@/pages/customer/kaitori'))
const CustomerSettingsPage = lazy(() => import('@/pages/customer/settings'))
const CustomerVerifyIdPage = lazy(() => import('@/pages/customer/verify-id'))
const CustomerReturnsPage = lazy(() => import('@/pages/customer/returns'))
const CustomerReturnDetailPage = lazy(() => import('@/pages/customer/return-detail'))
const CustomerReturnRequestPage = lazy(() => import('@/pages/customer/return-request'))
const AdminReturnsPage = lazy(() => import('@/pages/admin/returns'))
const AdminReturnDetailPage = lazy(() => import('@/pages/admin/return-detail'))
const ShowcasePage = lazy(() => import('@/pages/admin/showcase'))
const StaffManagementPage = lazy(() => import('@/pages/admin/staff-management'))
const ForgotPasswordPage = lazy(() => import('@/pages/admin/forgot-password'))
const AuthCallbackPage = lazy(() => import('@/pages/admin/auth-callback'))
const SetPasswordPage = lazy(() => import('@/pages/admin/set-password'))
const MessagesPage = lazy(() => import('@/pages/admin/messages'))
const MessagingSettingsPage = lazy(() => import('@/pages/admin/messaging-settings'))
const AccessoryDetailPage = lazy(() => import('@/pages/admin/accessory-detail'))
const InventoryReportPage = lazy(() => import('@/pages/admin/inventory-report'))
const ShopAccessoryDetailPage = lazy(() => import('@/pages/shop/accessory-detail'))

function lazyElement(Component: React.LazyExoticComponent<ComponentType>) {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Component />
    </Suspense>
  )
}

function adminElement(Component: React.LazyExoticComponent<ComponentType>) {
  return (
    <Suspense fallback={<RouteLoading />}>
      <AdminGuard>
        <Component />
      </AdminGuard>
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Navigate to="/admin/dashboard" replace />,
  },
  {
    path: '/admin/login',
    element: lazyElement(LoginPage),
  },
  {
    path: '/admin/forgot-password',
    element: lazyElement(ForgotPasswordPage),
  },
  {
    path: '/admin/auth/callback',
    element: lazyElement(AuthCallbackPage),
  },
  {
    path: '/admin/set-password',
    element: lazyElement(SetPasswordPage),
  },
  {
    path: '/admin/showcase',
    element: lazyElement(ShowcasePage),
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="/admin/dashboard" replace /> },
          { path: 'dashboard', element: lazyElement(DashboardPage) },
          { path: 'items', element: lazyElement(ItemListPage) },
          { path: 'items/intake', element: lazyElement(BulkIntakePage) },
          { path: 'items/scan', element: lazyElement(QRScannerPage) },
          { path: 'items/:id', element: lazyElement(ItemDetailPage) },
          { path: 'inspection', element: lazyElement(InspectionQueuePage) },
          { path: 'inspection/:id', element: lazyElement(InspectItemPage) },
          { path: 'products', element: lazyElement(ProductListPage) },
          { path: 'products/:id', element: lazyElement(ProductDetailPage) },
          { path: 'products/:id/media-studio', element: lazyElement(MediaStudioPage) },
          { path: 'categories', element: lazyElement(CategoriesPage) },
          { path: 'accessories', element: <Navigate to="/admin/items?inventoryTab=accessories" replace /> },
          { path: 'accessories/:id', element: lazyElement(AccessoryDetailPage) },
          { path: 'sell-groups', element: lazyElement(SellGroupListPage) },
          { path: 'sell-groups/:id', element: lazyElement(SellGroupDetailPage) },
          { path: 'orders', element: lazyElement(OrderListPage) },
          { path: 'orders/new', element: lazyElement(CreateOrderPage) },
          { path: 'orders/:id', element: lazyElement(OrderDetailPage) },
          { path: 'offers/:offerCode', element: lazyElement(OfferDetailPage) },
          { path: 'packing', element: lazyElement(PackingStationPage) },
          { path: 'kaitori', element: lazyElement(KaitoriListPage) },
          { path: 'kaitori/:id', element: lazyElement(KaitoriDetailPage) },
          { path: 'kaitori-prices', element: lazyElement(KaitoriPriceListPage) },
          { path: 'customers', element: lazyElement(CustomerListPage) },
          { path: 'customers/:id', element: lazyElement(CustomerDetailPage) },
          { path: 'receiving-reports', element: lazyElement(ReceivingReportsPage) },
          { path: 'receiving-reports/:id', element: lazyElement(ReceivingReportDetailPage) },
          { path: 'reports', element: lazyElement(ReportsPage) },
          { path: 'reports/inventory', element: lazyElement(InventoryReportPage) },
          { path: 'returns', element: lazyElement(AdminReturnsPage) },
          { path: 'returns/:id', element: lazyElement(AdminReturnDetailPage) },
          { path: 'messages', element: lazyElement(MessagesPage) },
          { path: 'suppliers', element: lazyElement(SupplierListPage) },
          { path: 'settings/messaging', element: adminElement(MessagingSettingsPage) },
          { path: 'settings/general', element: adminElement(GeneralSettingsPage) },
          { path: 'settings/ai', element: adminElement(AiSettingsPage) },
          { path: 'settings/items-columns', element: adminElement(ItemsColumnSettingsPage) },
          { path: 'settings/postal-codes', element: adminElement(PostalCodesPage) },
          { path: 'settings/staff', element: adminElement(StaffManagementPage) },
        ],
      },
    ],
  },
  {
    path: '/shop',
    element: <ShopLayout />,
    children: [
      { index: true, element: lazyElement(ShopBrowsePage) },
      { path: 'product/:id', element: lazyElement(ShopProductDetailPage) },
      { path: 'item/:id', element: lazyElement(ShopItemDetailPage) },
      { path: 'checkout/:sellGroupId', element: lazyElement(CheckoutPage) },
      { path: 'accessory/:id', element: lazyElement(ShopAccessoryDetailPage) },
    ],
  },
  {
    path: '/offer/:offerCode',
    element: lazyElement(OfferClaimPage),
  },
  {
    path: '/order/:sellGroupCode',
    element: <ShopLayout />,
    children: [
      { index: true, element: lazyElement(CheckoutPage) },
    ],
  },
  {
    path: '/sell',
    element: <ShopLayout />,
    children: [
      { index: true, element: lazyElement(KaitoriLandingPage) },
      { path: 'assess', element: lazyElement(KaitoriAssessPage) },
      { path: 'status', element: lazyElement(KaitoriStatusPage) },
    ],
  },
  {
    path: '/account',
    element: <CustomerLayout />,
    children: [
      { index: true, element: lazyElement(CustomerDashboardPage) },
      { path: 'login', element: lazyElement(CustomerLoginPage) },
      { path: 'register', element: lazyElement(CustomerRegisterPage) },
      { path: 'orders', element: lazyElement(CustomerOrdersPage) },
      { path: 'orders/:id', element: lazyElement(CustomerOrderDetailPage) },
      { path: 'kaitori', element: lazyElement(CustomerKaitoriPage) },
      { path: 'orders/:orderId/return', element: lazyElement(CustomerReturnRequestPage) },
      { path: 'returns', element: lazyElement(CustomerReturnsPage) },
      { path: 'returns/:id', element: lazyElement(CustomerReturnDetailPage) },
      { path: 'settings', element: lazyElement(CustomerSettingsPage) },
      { path: 'verify-id', element: lazyElement(CustomerVerifyIdPage) },
    ],
  },
])
