import { Link } from 'react-router-dom'
import { Package, HandCoins, Settings, ShieldCheck, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { useCustomerOrders, useCustomerKaitoriRequests } from '@/hooks/use-customers'
import { StatusBadge, CodeDisplay, PriceDisplay, TableSkeleton } from '@/components/shared'
import { ORDER_STATUSES, KAITORI_STATUSES } from '@/lib/constants'
import { formatDate } from '@/lib/utils'

export default function CustomerDashboardPage() {
  const { customer } = useCustomerAuth()
  const { data: orders, isLoading: ordersLoading } = useCustomerOrders(customer?.id ?? '')
  const { data: kaitoriRequests, isLoading: kaitoriLoading } = useCustomerKaitoriRequests(customer?.id ?? '')

  const recentOrders = orders?.slice(0, 3) ?? []
  const recentKaitori = kaitoriRequests?.slice(0, 3) ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Welcome, {customer?.last_name} {customer?.first_name}
        </h1>
        <p className="text-muted-foreground">Manage your orders, sales, and account settings.</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link to="/account/orders">
          <Card className="hover:bg-accent transition-colors cursor-pointer">
            <CardContent className="flex flex-col items-center gap-2 p-4">
              <Package className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">My Orders</span>
              <span className="text-xs text-muted-foreground">{orders?.length ?? 0} orders</span>
            </CardContent>
          </Card>
        </Link>
        <Link to="/account/kaitori">
          <Card className="hover:bg-accent transition-colors cursor-pointer">
            <CardContent className="flex flex-col items-center gap-2 p-4">
              <HandCoins className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">My Sales</span>
              <span className="text-xs text-muted-foreground">{kaitoriRequests?.length ?? 0} requests</span>
            </CardContent>
          </Card>
        </Link>
        <Link to="/account/settings">
          <Card className="hover:bg-accent transition-colors cursor-pointer">
            <CardContent className="flex flex-col items-center gap-2 p-4">
              <Settings className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Settings</span>
              <span className="text-xs text-muted-foreground">Profile & PIN</span>
            </CardContent>
          </Card>
        </Link>
        <Link to="/account/verify-id">
          <Card className="hover:bg-accent transition-colors cursor-pointer">
            <CardContent className="flex flex-col items-center gap-2 p-4">
              <ShieldCheck className={`h-6 w-6 ${customer?.id_verified ? 'text-green-600' : 'text-amber-500'}`} />
              <span className="text-sm font-medium">ID Verification</span>
              <span className="text-xs text-muted-foreground">
                {customer?.id_verified ? 'Verified' : 'Not verified'}
              </span>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Orders */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Recent Orders</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/account/orders">
              View All <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No orders yet.</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <Link
                  key={order.id}
                  to={`/account/orders/${order.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <CodeDisplay code={order.order_code} />
                    <div>
                      <StatusBadge
                        status={order.order_status}
                        config={ORDER_STATUSES}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(order.created_at)}
                      </p>
                    </div>
                  </div>
                  <PriceDisplay price={order.total_price} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Kaitori Requests */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Recent Sales (Kaitori)</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/account/kaitori">
              View All <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {kaitoriLoading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : recentKaitori.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No sell requests yet.{' '}
              <Link to="/sell" className="text-primary hover:underline">
                Sell your device
              </Link>
            </p>
          ) : (
            <div className="space-y-3">
              {recentKaitori.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-3">
                    <CodeDisplay code={req.kaitori_code} />
                    <div>
                      <StatusBadge
                        status={req.request_status}
                        config={KAITORI_STATUSES}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(req.created_at)}
                      </p>
                    </div>
                  </div>
                  <PriceDisplay price={req.final_price ?? req.auto_quote_price} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
