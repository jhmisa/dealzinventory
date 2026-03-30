import { useParams, Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, Circle, Package, Truck, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useOrder } from '@/hooks/use-orders'
import { StatusBadge, CodeDisplay, PriceDisplay, FormSkeleton } from '@/components/shared'
import { ORDER_STATUSES, CONDITION_GRADES, YAMATO_TIME_SLOTS } from '@/lib/constants'
import { formatDateTime, formatDate, formatPrice, cn } from '@/lib/utils'

const STATUS_FLOW = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'] as const

type OrderItemRow = {
  id: string
  item_id: string | null
  description: string
  quantity: number
  unit_price: number
  discount: number
  items: {
    id: string
    item_code: string
    condition_grade: string
    item_status: string
    product_models: {
      brand: string
      model_name: string
      color: string | null
      cpu: string | null
      ram_gb: string | null
      storage_gb: string | null
      product_media: { file_url: string; role: string; sort_order: number }[]
    } | null
  } | null
}

export default function CustomerOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: order, isLoading } = useOrder(id!)

  if (isLoading) return <FormSkeleton fields={6} />
  if (!order) return <div className="text-center py-12 text-muted-foreground">Order not found.</div>

  const orderItems = (order.order_items ?? []) as OrderItemRow[]
  const currentIdx = STATUS_FLOW.indexOf(order.order_status as typeof STATUS_FLOW[number])
  const isCancelled = order.order_status === 'CANCELLED'

  const subtotal = orderItems.reduce(
    (sum, oi) => sum + Number(oi.unit_price) * oi.quantity - Number(oi.discount),
    0,
  )
  const shippingCost = Number(order.shipping_cost ?? 0)

  const timeSlot = order.delivery_time_code
    ? YAMATO_TIME_SLOTS.find(s => s.code === order.delivery_time_code)
    : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild aria-label="Back to orders">
          <Link to="/account/orders">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Order <CodeDisplay code={order.order_code} />
          </h1>
          <p className="text-sm text-muted-foreground">{formatDateTime(order.created_at)}</p>
        </div>
      </div>

      {/* Status Tracker */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Order Status</CardTitle>
        </CardHeader>
        <CardContent>
          {isCancelled ? (
            <div className="text-center py-4">
              <StatusBadge status="CANCELLED" config={ORDER_STATUSES} />
              <p className="text-sm text-muted-foreground mt-2">This order has been cancelled.</p>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              {STATUS_FLOW.map((status, idx) => {
                const isCompleted = idx <= currentIdx
                const isCurrent = idx === currentIdx
                const config = ORDER_STATUSES.find((s) => s.value === status)

                return (
                  <div key={status} className="flex-1 flex flex-col items-center relative">
                    <div
                      className={cn(
                        'h-8 w-8 rounded-full flex items-center justify-center border-2',
                        isCompleted
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-muted-foreground/30 text-muted-foreground',
                        isCurrent && 'ring-2 ring-primary ring-offset-2',
                      )}
                    >
                      {isCompleted ? <Check className="h-4 w-4" /> : <Circle className="h-3 w-3" />}
                    </div>
                    <span
                      className={cn(
                        'text-xs mt-1.5 text-center',
                        isCurrent ? 'font-semibold' : 'text-muted-foreground',
                      )}
                    >
                      {config?.label ?? status}
                    </span>
                    {idx < STATUS_FLOW.length - 1 && (
                      <div
                        className={cn(
                          'absolute top-4 left-[50%] w-full h-0.5',
                          idx < currentIdx ? 'bg-primary' : 'bg-muted-foreground/20',
                        )}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5" />
            Items
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {orderItems.map((oi) => {
            const pm = oi.items?.product_models
            const heroMedia = pm?.product_media
              ?.filter(m => m.role === 'hero')
              .sort((a, b) => a.sort_order - b.sort_order)[0]
            const fallbackMedia = pm?.product_media
              ?.sort((a, b) => a.sort_order - b.sort_order)[0]
            const imgUrl = heroMedia?.file_url ?? fallbackMedia?.file_url
            const gradeInfo = oi.items
              ? CONDITION_GRADES.find(g => g.value === oi.items!.condition_grade)
              : null

            return (
              <div key={oi.id} className="flex gap-4 p-3 border rounded-lg">
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt={oi.description}
                    className="w-20 h-20 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs shrink-0">
                    No img
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{oi.description}</p>
                  {pm?.short_description && (
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {pm.short_description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {oi.items && (
                      <span className="text-xs text-muted-foreground font-mono">{oi.items.item_code}</span>
                    )}
                    {gradeInfo && (
                      <Badge variant="outline" className={cn('text-xs', gradeInfo.color)}>
                        Grade {gradeInfo.value}
                      </Badge>
                    )}
                    {oi.quantity > 1 && (
                      <span className="text-xs text-muted-foreground">&times;{oi.quantity}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <PriceDisplay price={Number(oi.unit_price) * oi.quantity} />
                  {Number(oi.discount) > 0 && (
                    <p className="text-xs text-green-600">-{formatPrice(Number(oi.discount))}</p>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Order Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Subtotal ({order.quantity} item{order.quantity !== 1 ? 's' : ''})
              </span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Shipping</span>
              <span>{shippingCost > 0 ? formatPrice(shippingCost) : 'Free'}</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Total</span>
              <PriceDisplay price={order.total_price} className="text-lg font-bold" />
            </div>
          </CardContent>
        </Card>

        {/* Delivery & Shipping */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Delivery
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(order.delivery_date || timeSlot) && (
              <div className="flex items-start gap-2">
                <CalendarDays className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  {order.delivery_date && (
                    <p className="text-sm font-medium">{formatDate(order.delivery_date)}</p>
                  )}
                  {timeSlot && (
                    <p className="text-sm text-muted-foreground">{timeSlot.label}</p>
                  )}
                </div>
              </div>
            )}
            {!order.delivery_date && !timeSlot && (
              <p className="text-sm text-muted-foreground">No delivery date scheduled yet.</p>
            )}
            {order.shipping_address && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1">Shipping to:</p>
                <p className="text-sm whitespace-pre-wrap">{order.shipping_address}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {order.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{order.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Report a Problem */}
      {['SHIPPED', 'DELIVERED'].includes(order.order_status) && (
        <Button variant="outline" asChild className="w-full">
          <Link to={`/account/orders/${order.id}/return`}>
            <AlertTriangle className="h-4 w-4 mr-2" />
            Report a Problem
          </Link>
        </Button>
      )}
    </div>
  )
}
