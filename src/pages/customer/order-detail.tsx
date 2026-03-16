import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Check, Circle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useOrder } from '@/hooks/use-orders'
import { StatusBadge, CodeDisplay, PriceDisplay, FormSkeleton } from '@/components/shared'
import { ORDER_STATUSES } from '@/lib/constants'
import { formatDateTime, cn } from '@/lib/utils'

const STATUS_FLOW = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'] as const

export default function CustomerOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: order, isLoading } = useOrder(id!)

  if (isLoading) return <FormSkeleton fields={6} />
  if (!order) return <div className="text-center py-12 text-muted-foreground">Order not found.</div>

  const sg = order.sell_groups as {
    sell_group_code: string
    condition_grade: string
    base_price: number
    product_models: {
      brand: string
      model_name: string
      cpu: string | null
      ram_gb: number | null
      storage_gb: number | null
    } | null
  } | null

  const currentIdx = STATUS_FLOW.indexOf(order.order_status as typeof STATUS_FLOW[number])
  const isCancelled = order.order_status === 'CANCELLED'

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

      {/* Order Details */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Product</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sg?.product_models && (
              <div>
                <p className="font-medium">
                  {sg.product_models.brand} {sg.product_models.model_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {[sg.product_models.cpu, sg.product_models.ram_gb && `${sg.product_models.ram_gb}GB RAM`, sg.product_models.storage_gb && `${sg.product_models.storage_gb}GB`]
                    .filter(Boolean)
                    .join(' / ')}
                </p>
              </div>
            )}
            {sg && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Group:</span>
                <CodeDisplay code={sg.sell_group_code} />
                <span className="text-muted-foreground">Grade: {sg.condition_grade}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quantity</span>
              <span>{order.quantity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <PriceDisplay price={order.total_price} className="text-lg font-bold" />
            </div>
            {order.shipping_address && (
              <div className="pt-2 border-t">
                <span className="text-sm text-muted-foreground">Shipping to:</span>
                <p className="text-sm mt-1">{order.shipping_address}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
