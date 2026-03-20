import { Link } from 'react-router-dom'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { useCustomerOrders } from '@/hooks/use-customers'
import { StatusBadge, CodeDisplay, PriceDisplay, TableSkeleton, EmptyState } from '@/components/shared'
import { ORDER_STATUSES } from '@/lib/constants'
import { formatDate } from '@/lib/utils'

type OrderItemRow = {
  id: string
  item_id: string | null
  description: string
  quantity: number
  unit_price: number
  items: {
    item_code: string
    condition_grade: string
    product_models: {
      brand: string
      model_name: string
      color: string | null
      product_media: { file_url: string; role: string; sort_order: number }[]
    } | null
  } | null
}

function getOrderHeroImage(orderItems: OrderItemRow[]): string | null {
  for (const oi of orderItems) {
    const media = oi.items?.product_models?.product_media
    if (media?.length) {
      const hero = media
        .filter(m => m.role === 'hero')
        .sort((a, b) => a.sort_order - b.sort_order)[0]
      if (hero) return hero.file_url
      return media.sort((a, b) => a.sort_order - b.sort_order)[0].file_url
    }
  }
  return null
}

function getOrderDescription(orderItems: OrderItemRow[]): string {
  if (!orderItems.length) return 'No items'
  const first = orderItems[0]
  const pm = first.items?.product_models
  const name = pm ? `${pm.brand} ${pm.model_name}` : first.description
  if (orderItems.length === 1) return name
  return `${name} + ${orderItems.length - 1} more`
}

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
            const orderItems = (order.order_items ?? []) as OrderItemRow[]
            const heroUrl = getOrderHeroImage(orderItems)
            const description = getOrderDescription(orderItems)

            return (
              <Link
                key={order.id}
                to={`/account/orders/${order.id}`}
                className="flex items-center gap-4 p-4 rounded-lg border hover:bg-accent transition-colors"
              >
                {heroUrl ? (
                  <img
                    src={heroUrl}
                    alt={description}
                    className="w-14 h-14 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs shrink-0">
                    No img
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <CodeDisplay code={order.order_code} />
                    <StatusBadge status={order.order_status} config={ORDER_STATUSES} />
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{description}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
                </div>
                <div className="text-right shrink-0">
                  <PriceDisplay price={order.total_price} />
                  <p className="text-xs text-muted-foreground">
                    {order.quantity} item{order.quantity !== 1 ? 's' : ''}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
