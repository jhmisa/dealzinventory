import { Link } from 'react-router-dom'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { useCustomerKaitoriRequests } from '@/hooks/use-customers'
import { StatusBadge, CodeDisplay, PriceDisplay, TableSkeleton, EmptyState } from '@/components/shared'
import { KAITORI_STATUSES } from '@/lib/constants'
import { formatDate } from '@/lib/utils'

export default function CustomerKaitoriPage() {
  const { customer } = useCustomerAuth()
  const { data: requests, isLoading } = useCustomerKaitoriRequests(customer?.id ?? '')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Sales (Kaitori)</h1>

      {isLoading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : !requests?.length ? (
        <EmptyState
          title="No sell requests yet"
          description="Sell your device to us and get a fair price."
          action={
            <Link to="/sell" className="text-primary hover:underline text-sm font-medium">
              Sell Your Device
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const model = req.product_models as { brand: string; model_name: string; ram_gb: string | null; storage_gb: string | null } | null

            return (
              <div
                key={req.id}
                className="flex items-center justify-between p-4 rounded-lg border"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CodeDisplay code={req.kaitori_code} />
                    <StatusBadge status={req.request_status} config={KAITORI_STATUSES} />
                  </div>
                  {model && (
                    <p className="text-sm text-muted-foreground">
                      {model.brand} {model.model_name}
                      {model.short_description && ` — ${model.short_description}`}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{formatDate(req.created_at)}</p>
                </div>
                <div className="text-right">
                  <PriceDisplay price={req.final_price ?? req.auto_quote_price} />
                  {req.request_status === 'PRICE_REVISED' && (
                    <p className="text-xs text-amber-600 font-medium mt-1">
                      Price revised - review required
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
