import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  PanelLeftOpen,
  PanelRightClose,
  ShieldCheck,
  ShieldX,
  ExternalLink,
  User,
  Store,
  Unlink,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { CodeDisplay } from '@/components/shared/code-display'
import { StatusBadge } from '@/components/shared/status-badge'
import { AddressDisplay } from '@/components/shared/address-display'
import { CustomerLinker } from '@/components/messaging/customer-linker'
import { OrderDetailDialog } from '@/components/messaging/order-detail-dialog'
import { useCustomerWithDetails } from '@/hooks/use-customers'
import { ORDER_STATUSES, KAITORI_STATUSES } from '@/lib/constants'
import { formatPrice, formatDate, formatCustomerName } from '@/lib/utils'
import type { ConversationWithRelations } from '@/lib/types'

interface CustomerPanelProps {
  conversation: ConversationWithRelations
  onLinkCustomer: (customerId: string) => void
  onUnlinkCustomer: () => void
  collapsed: boolean
  onToggleCollapse: () => void
}

export function CustomerPanel({
  conversation,
  onLinkCustomer,
  onUnlinkCustomer,
  collapsed,
  onToggleCollapse,
}: CustomerPanelProps) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const customerId = conversation.customers?.id ?? ''
  const { data: customerDetails } = useCustomerWithDetails(customerId)

  if (collapsed) {
    return (
      <div className="w-10 shrink-0 border-l flex flex-col items-center pt-2">
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8">
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  const isLinked = !!conversation.customers
  const customer = customerDetails

  return (
    <div className="w-[300px] shrink-0 border-l flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium">Customer</span>
        <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="h-8 w-8">
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Section 1 — Contact Info */}
          {isLinked && customer ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">
                  {formatCustomerName(customer)}
                </span>
              </div>
              <div className="space-y-1 text-sm text-muted-foreground">
                <Link
                  to={`/admin/customers/${customer.id}`}
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <CodeDisplay code={customer.customer_code} className="text-xs" />
                  <ExternalLink className="h-3 w-3" />
                </Link>
                {customer.email && <p>{customer.email}</p>}
                {customer.phone && <p>{customer.phone}</p>}
                {customer.shipping_address && (
                  <AddressDisplay address={customer.shipping_address as string} className="text-xs" />
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">
                  {conversation.contact_name ?? 'Unknown contact'}
                </span>
              </div>
              <CustomerLinker
                onLink={onLinkCustomer}
                trigger={
                  <Button variant="outline" size="sm" className="w-full">
                    Link Customer
                  </Button>
                }
              />
            </div>
          )}

          {/* Section 2 — Verification */}
          {isLinked && customer && (
            <div className="space-y-1.5 border-t pt-3">
              <div className="flex items-center gap-2 text-sm">
                {customer.id_verified ? (
                  <>
                    <ShieldCheck className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="text-green-700">ID Verified</span>
                  </>
                ) : (
                  <>
                    <ShieldX className="h-4 w-4 text-red-500 shrink-0" />
                    <span className="text-red-600">Not Verified</span>
                  </>
                )}
              </div>
              {customer.is_seller && (
                <div className="flex items-center gap-2 text-sm">
                  <Store className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground">Seller</span>
                </div>
              )}
            </div>
          )}

          {/* Section 3 — Orders */}
          {isLinked && customer && (
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Orders</span>
                {customer.orders?.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                    {customer.orders.length}
                  </Badge>
                )}
              </div>
              {customer.orders?.length > 0 ? (
                <div className="space-y-1.5">
                  {[...customer.orders]
                    .sort((a: { created_at: string }, b: { created_at: string }) =>
                      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                    )
                    .map((order: { id: string; order_code: string; order_status: string; total_price: number | null; created_at: string }) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedOrderId(order.id)}
                      className="flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-xs hover:bg-accent transition-colors text-left"
                    >
                      <div className="space-y-0.5">
                        <CodeDisplay code={order.order_code} className="text-[11px]" />
                        <p className="text-muted-foreground">{formatDate(order.created_at)}</p>
                      </div>
                      <div className="text-right space-y-0.5">
                        <StatusBadge status={order.order_status} config={ORDER_STATUSES} />
                        <p className="text-muted-foreground">{formatPrice(order.total_price)}</p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No orders yet</p>
              )}
              <OrderDetailDialog
                orderId={selectedOrderId}
                onClose={() => setSelectedOrderId(null)}
              />
            </div>
          )}

          {/* Section 4 — Kaitori */}
          {isLinked && customer && (
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Kaitori</span>
                {customer.kaitori_requests?.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                    {customer.kaitori_requests.length}
                  </Badge>
                )}
              </div>
              {customer.kaitori_requests?.length > 0 ? (
                <div className="space-y-1.5">
                  {customer.kaitori_requests.map((kt: { id: string; kaitori_code: string; request_status: string; auto_quote_price: number | null; final_price: number | null; created_at: string }) => (
                    <Link
                      key={kt.id}
                      to={`/admin/kaitori/${kt.id}`}
                      className="flex items-center justify-between rounded-md border px-2 py-1.5 text-xs hover:bg-accent transition-colors"
                    >
                      <div className="space-y-0.5">
                        <CodeDisplay code={kt.kaitori_code} className="text-[11px]" />
                        <p className="text-muted-foreground">{formatDate(kt.created_at)}</p>
                      </div>
                      <div className="text-right space-y-0.5">
                        <StatusBadge status={kt.request_status} config={KAITORI_STATUSES} />
                        <p className="text-muted-foreground">
                          {formatPrice(kt.final_price ?? kt.auto_quote_price)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No kaitori requests</p>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      {isLinked && customer && (
        <div className="border-t px-3 py-2 flex items-center justify-between">
          <Link
            to={`/admin/customers/${customer.id}`}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            View Full Profile
            <ExternalLink className="h-3 w-3" />
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="xs" className="text-xs text-muted-foreground hover:text-destructive">
                <Unlink className="h-3 w-3 mr-1" />
                Unlink
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Unlink customer?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will unlink <span className="font-medium text-foreground">{formatCustomerName(customer)}</span> ({customer.customer_code}) from this conversation. You can re-link a customer at any time.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onUnlinkCustomer} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Unlink
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  )
}
