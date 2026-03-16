import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Circle, Package } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  PageHeader,
  StatusBadge,
  GradeBadge,
  CodeDisplay,
  PriceDisplay,
  ConfirmDialog,
  FormSkeleton,
} from '@/components/shared'
import { useOrder, useUpdateOrderStatus } from '@/hooks/use-orders'
import { ORDER_STATUSES, ORDER_SOURCES } from '@/lib/constants'
import { formatDateTime, cn } from '@/lib/utils'
import { useState } from 'react'

const STATUS_FLOW = ['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'] as const

function getNextStatus(current: string): string | null {
  const idx = STATUS_FLOW.indexOf(current as typeof STATUS_FLOW[number])
  if (idx === -1 || idx >= STATUS_FLOW.length - 1) return null
  return STATUS_FLOW[idx + 1]
}

function getNextStatusLabel(status: string | null): string {
  if (!status) return ''
  return ORDER_STATUSES.find(s => s.value === status)?.label ?? status
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: order, isLoading } = useOrder(id!)
  const statusMutation = useUpdateOrderStatus()

  const [cancelOpen, setCancelOpen] = useState(false)
  const [advanceOpen, setAdvanceOpen] = useState(false)

  if (isLoading) return <FormSkeleton fields={6} />
  if (!order) return <div className="text-center py-12 text-muted-foreground">Order not found.</div>

  const customer = order.customers as { customer_code: string; last_name: string; first_name: string | null; email: string | null; phone: string | null } | null
  const sg = order.sell_groups as {
    sell_group_code: string
    condition_grade: string
    base_price: number
    product_models: { brand: string; model_name: string; color: string } | null
  } | null
  const pm = sg?.product_models
  const orderItems = (order.order_items ?? []) as { id: string; packed_at: string | null; packed_by: string | null; items: { id: string; item_code: string; condition_grade: string; item_status: string } | null }[]
  const statusCfg = ORDER_STATUSES.find(s => s.value === order.order_status)
  const sourceCfg = ORDER_SOURCES.find(s => s.value === order.order_source)
  const nextStatus = getNextStatus(order.order_status)
  const canCancel = order.order_status !== 'SHIPPED' && order.order_status !== 'DELIVERED' && order.order_status !== 'CANCELLED'

  function handleAdvance() {
    if (!nextStatus) return
    statusMutation.mutate(
      { id: order!.id, status: nextStatus },
      {
        onSuccess: () => { toast.success(`Order ${getNextStatusLabel(nextStatus).toLowerCase()}`); setAdvanceOpen(false) },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  function handleCancel() {
    statusMutation.mutate(
      { id: order!.id, status: 'CANCELLED' },
      {
        onSuccess: () => { toast.success('Order cancelled'); setCancelOpen(false) },
        onError: (err) => toast.error(`Failed: ${err.message}`),
      },
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin/orders')} aria-label="Back to orders">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          title={order.order_code}
          description={pm ? `${pm.brand} ${pm.model_name}` : undefined}
          actions={
            <div className="flex gap-2">
              {nextStatus && order.order_status !== 'CANCELLED' && (
                <Button size="sm" onClick={() => setAdvanceOpen(true)}>
                  Advance to {getNextStatusLabel(nextStatus)}
                </Button>
              )}
              {canCancel && (
                <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
                  Cancel Order
                </Button>
              )}
            </div>
          }
        />
      </div>

      {/* Status Stepper */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            {STATUS_FLOW.map((step, i) => {
              const stepIdx = STATUS_FLOW.indexOf(order.order_status as typeof STATUS_FLOW[number])
              const isCancelled = order.order_status === 'CANCELLED'
              const isActive = !isCancelled && step === order.order_status
              const isCompleted = !isCancelled && stepIdx > i
              const stepCfg = ORDER_STATUSES.find(s => s.value === step)

              return (
                <div key={step} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all',
                        isCompleted && 'bg-primary border-primary text-primary-foreground',
                        isActive && 'border-primary bg-primary/10',
                        !isCompleted && !isActive && 'border-muted text-muted-foreground',
                      )}
                    >
                      {isCompleted ? (
                        <Check className="h-4 w-4" />
                      ) : isActive ? (
                        <Circle className="h-3 w-3 fill-primary text-primary" />
                      ) : (
                        <span className="text-xs">{i + 1}</span>
                      )}
                    </div>
                    <span className={cn(
                      'text-xs',
                      (isActive || isCompleted) ? 'font-medium' : 'text-muted-foreground',
                    )}>
                      {stepCfg?.label}
                    </span>
                  </div>
                  {i < STATUS_FLOW.length - 1 && (
                    <div className={cn(
                      'flex-1 h-0.5 mx-2',
                      isCompleted ? 'bg-primary' : 'bg-muted',
                    )} />
                  )}
                </div>
              )
            })}
          </div>
          {order.order_status === 'CANCELLED' && (
            <div className="mt-4 text-center">
              <StatusBadge label="Cancelled" color="bg-red-100 text-red-800 border-red-300" />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Order Info */}
        <Card>
          <CardHeader>
            <CardTitle>Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Code</span><CodeDisplay code={order.order_code} /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span>{statusCfg && <StatusBadge label={statusCfg.label} color={statusCfg.color} />}</div>
            <div className="flex justify-between"><span className="text-muted-foreground">Source</span><span>{sourceCfg?.label ?? order.order_source}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Quantity</span><span>{order.quantity}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total</span><PriceDisplay amount={order.total_price} /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{formatDateTime(order.created_at)}</span></div>
          </CardContent>
        </Card>

        {/* Customer Info */}
        <Card>
          <CardHeader>
            <CardTitle>Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {customer ? (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Code</span><CodeDisplay code={customer.customer_code} /></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span>{customer.last_name} {customer.first_name ?? ''}</span></div>
                {customer.email && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{customer.email}</span></div>}
                {customer.phone && <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{customer.phone}</span></div>}
              </>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
            <div className="pt-2 border-t">
              <p className="text-muted-foreground text-xs mb-1">Shipping Address</p>
              <p className="whitespace-pre-wrap">{order.shipping_address}</p>
            </div>
          </CardContent>
        </Card>

        {/* Product Info */}
        <Card>
          <CardHeader>
            <CardTitle>Product</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {sg ? (
              <>
                <div className="flex justify-between"><span className="text-muted-foreground">Sell Group</span><CodeDisplay code={sg.sell_group_code} /></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Model</span><span>{pm ? `${pm.brand} ${pm.model_name}` : '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Grade</span><GradeBadge grade={sg.condition_grade} /></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Unit Price</span><PriceDisplay amount={sg.base_price} /></div>
              </>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Order Items */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Order Items ({orderItems.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {orderItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No items assigned to this order yet.</p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-4 gap-4 px-3 py-2 text-xs font-medium text-muted-foreground uppercase">
                <span>P-Code</span>
                <span>Grade</span>
                <span>Packed</span>
                <span>Packed At</span>
              </div>
              {orderItems.map((oi) => {
                const item = oi.items
                return (
                  <div
                    key={oi.id}
                    className={cn(
                      'grid grid-cols-4 gap-4 items-center px-3 py-2 border-b last:border-0 rounded',
                      oi.packed_at ? 'bg-green-50' : '',
                    )}
                  >
                    <div>
                      {item ? (
                        <CodeDisplay code={item.item_code} />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                    <div>{item ? <GradeBadge grade={item.condition_grade} /> : '—'}</div>
                    <div>
                      {oi.packed_at ? (
                        <StatusBadge label="Packed" color="bg-green-100 text-green-800 border-green-300" />
                      ) : (
                        <StatusBadge label="Unpacked" color="bg-gray-100 text-gray-800 border-gray-300" />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {oi.packed_at ? formatDateTime(oi.packed_at) : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={advanceOpen}
        onOpenChange={setAdvanceOpen}
        title={`Advance to ${getNextStatusLabel(nextStatus)}`}
        description={`Move order ${order.order_code} to "${getNextStatusLabel(nextStatus)}" status?`}
        onConfirm={handleAdvance}
        isLoading={statusMutation.isPending}
      />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel Order"
        description={`Are you sure you want to cancel order ${order.order_code}? This action cannot be undone.`}
        onConfirm={handleCancel}
        isLoading={statusMutation.isPending}
        variant="destructive"
      />
    </div>
  )
}
