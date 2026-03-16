import { Link } from 'react-router-dom'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { useCustomerOrders } from '@/hooks/use-customers'
import { StatusBadge, CodeDisplay, PriceDisplay, TableSkeleton, EmptyState } from '@/components/shared'
import { ORDER_STATUSES } from '@/lib/constants'
import { formatDate } from '@/lib/utils'

export default function CustomerOrdersPage() {
  const { customer } = useCustomerAuth()
  const { data: orders, isLoading } = useCustomerOrders(customer?.id ?? '')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Orders</h1>

      {isLoading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : !orders?.length ? (
        <EmptyState
          title="No orders yet"
          description="Browse our shop to find great deals on refurbished devices."
          action={
            <Link to="/shop" className="text-primary hover:underline text-sm font-medium">
              Browse Shop
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const sg = order.sell_groups as {
              sell_group_code: string
              product_models: {
                brand: string
                model_name: string
                ram_gb: number | null
                storage_gb: number | null
              } | null
            } | null

            return (
              <Link
                key={order.id}
                to={`/account/orders/${order.id}`}
                className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CodeDisplay code={order.order_code} />
                    <StatusBadge status={order.order_status} config={ORDER_STATUSES} />
                  </div>
                  {sg?.product_models && (
                    <p className="text-sm text-muted-foreground">
                      {sg.product_models.brand} {sg.product_models.model_name}
                      {sg.product_models.ram_gb && ` / ${sg.product_models.ram_gb}GB`}
                      {sg.product_models.storage_gb && ` / ${sg.product_models.storage_gb}GB`}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
                </div>
                <div className="text-right">
                  <PriceDisplay price={order.total_price} />
                  <p className="text-xs text-muted-foreground">Qty: {order.quantity}</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
