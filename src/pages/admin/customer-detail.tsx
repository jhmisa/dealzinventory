import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, ShieldX } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  PageHeader,
  StatusBadge,
  CodeDisplay,
  PriceDisplay,
  ConfirmDialog,
  FormSkeleton,
  TableSkeleton,
  EmptyState,
} from '@/components/shared'
import {
  useCustomerWithDetails,
  useCustomerOrders,
  useCustomerKaitoriRequests,
  useVerifyCustomerId,
} from '@/hooks/use-customers'
import { ORDER_STATUSES, KAITORI_STATUSES } from '@/lib/constants'
import { formatDate, formatDateTime } from '@/lib/utils'
import { useState } from 'react'

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: customer, isLoading } = useCustomerWithDetails(id!)
  const { data: orders, isLoading: ordersLoading } = useCustomerOrders(id!)
  const { data: kaitoriRequests, isLoading: kaitoriLoading } = useCustomerKaitoriRequests(id!)
  const verifyMutation = useVerifyCustomerId()
  const [verifyOpen, setVerifyOpen] = useState(false)

  if (isLoading) return <FormSkeleton fields={8} />
  if (!customer) return <div className="text-center py-12 text-muted-foreground">Customer not found.</div>

  async function handleVerify() {
    try {
      await verifyMutation.mutateAsync(id!)
      toast.success('Customer ID verified')
      setVerifyOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/customers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title={`${customer.last_name} ${customer.first_name ?? ''}`}
          subtitle={<CodeDisplay code={customer.customer_code} />}
        />
      </div>

      {/* Customer Info */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="Email" value={customer.email ?? '-'} />
            <InfoRow label="Phone" value={customer.phone ?? '-'} />
            <InfoRow label="Shipping Address" value={customer.shipping_address ?? '-'} />
            <InfoRow label="Registered" value={formatDateTime(customer.created_at)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Verification & Status</CardTitle>
            {!customer.id_verified && (
              <Button size="sm" onClick={() => setVerifyOpen(true)}>
                <ShieldCheck className="h-4 w-4 mr-1" />
                Verify ID
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">ID Verified</span>
              {customer.id_verified ? (
                <div className="flex items-center gap-1.5 text-green-600">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="text-sm font-medium">Verified</span>
                  {customer.id_verified_at && (
                    <span className="text-xs text-muted-foreground ml-1">
                      ({formatDate(customer.id_verified_at)})
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-amber-600">
                  <ShieldX className="h-4 w-4" />
                  <span className="text-sm">Not verified</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Seller Status</span>
              {customer.is_seller ? (
                <Badge variant="secondary">Active Seller</Badge>
              ) : (
                <span className="text-sm text-muted-foreground">Buyer only</span>
              )}
            </div>
            {customer.id_document_url && (
              <div className="pt-2 border-t">
                <span className="text-sm text-muted-foreground block mb-1">ID Document:</span>
                <a
                  href={customer.id_document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  View Document
                </a>
              </div>
            )}
            {customer.is_seller && (
              <div className="pt-2 border-t space-y-1">
                <span className="text-sm font-medium">Bank Details</span>
                <InfoRow label="Bank" value={customer.bank_name ?? '-'} />
                <InfoRow label="Branch" value={customer.bank_branch ?? '-'} />
                <InfoRow label="Account" value={customer.bank_account_number ?? '-'} />
                <InfoRow label="Holder" value={customer.bank_account_holder ?? '-'} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Order History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Order History ({orders?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : !orders?.length ? (
            <EmptyState title="No orders" description="This customer has no orders." />
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  to={`/admin/orders/${order.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <CodeDisplay code={order.order_code} />
                    <StatusBadge status={order.order_status} config={ORDER_STATUSES} />
                    <span className="text-xs text-muted-foreground">{formatDate(order.created_at)}</span>
                  </div>
                  <PriceDisplay price={order.total_price} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kaitori History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Kaitori History ({kaitoriRequests?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {kaitoriLoading ? (
            <TableSkeleton rows={3} cols={4} />
          ) : !kaitoriRequests?.length ? (
            <EmptyState title="No Kaitori requests" description="This customer has no sell requests." />
          ) : (
            <div className="space-y-2">
              {kaitoriRequests.map((req) => (
                <Link
                  key={req.id}
                  to={`/admin/kaitori/${req.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <CodeDisplay code={req.kaitori_code} />
                    <StatusBadge status={req.request_status} config={KAITORI_STATUSES} />
                    <span className="text-xs text-muted-foreground">{formatDate(req.created_at)}</span>
                  </div>
                  <PriceDisplay price={req.final_price ?? req.auto_quote_price} />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        title="Verify Customer ID"
        description="Confirm that you have reviewed and verified this customer's government-issued ID. This action cannot be undone."
        confirmLabel="Verify ID"
        onConfirm={handleVerify}
        loading={verifyMutation.isPending}
      />
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right max-w-[60%]">{value}</span>
    </div>
  )
}
