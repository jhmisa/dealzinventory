import { Link } from 'react-router-dom'
import { ExternalLink, Package } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CodeDisplay } from '@/components/shared/code-display'
import { StatusBadge } from '@/components/shared/status-badge'
import { ORDER_STATUSES } from '@/lib/constants'
import { formatPrice, formatDate } from '@/lib/utils'
import { useOrder } from '@/hooks/use-orders'
import { Skeleton } from '@/components/ui/skeleton'

interface OrderDetailDialogProps {
  orderId: string | null
  onClose: () => void
}

export function OrderDetailDialog({ orderId, onClose }: OrderDetailDialogProps) {
  const { data: order, isLoading } = useOrder(orderId ?? '')

  return (
    <Dialog open={!!orderId} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        {isLoading ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : order ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CodeDisplay code={order.order_code} />
                <StatusBadge status={order.order_status} config={ORDER_STATUSES} />
              </DialogTitle>
              <p className="text-sm text-muted-foreground">{formatDate(order.created_at)}</p>
            </DialogHeader>

            {/* Order Items */}
            <div className="space-y-2">
              <span className="text-sm font-medium">Items</span>
              {order.order_items?.length > 0 ? (
                <div className="space-y-1.5">
                  {order.order_items.map((item: { id: string; description: string; quantity: number; unit_price: number; discount: number; items?: { item_code: string; product_models?: { brand: string; model_name: string } | null } | null }) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between rounded-md border px-2.5 py-2 text-sm"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <p className="font-medium truncate">
                          {item.items?.product_models
                            ? `${item.items.product_models.brand} ${item.items.product_models.model_name}`
                            : item.description}
                        </p>
                        {item.items && (
                          <p className="text-xs text-muted-foreground">{item.items.item_code}</p>
                        )}
                        {item.quantity > 1 && (
                          <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="font-medium">{formatPrice(item.unit_price)}</p>
                        {item.discount > 0 && (
                          <p className="text-xs text-green-600">-{formatPrice(item.discount)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No items</p>
              )}
            </div>

            {/* Total */}
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm font-medium">Total</span>
              <span className="text-lg font-semibold">{formatPrice(order.total_price)}</span>
            </div>

            {/* Notes */}
            {order.notes && (
              <div className="space-y-1 border-t pt-3">
                <span className="text-sm font-medium">Notes</span>
                <p className="text-sm text-muted-foreground">{order.notes}</p>
              </div>
            )}

            {/* Open Full Order link */}
            <div className="border-t pt-3">
              <Link
                to={`/admin/orders/${order.id}`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <Package className="h-3.5 w-3.5" />
                Open Full Order
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
