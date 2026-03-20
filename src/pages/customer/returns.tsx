import { Link } from 'react-router-dom'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { useCustomerReturns } from '@/hooks/use-returns'
import { StatusBadge, CodeDisplay, TableSkeleton, EmptyState } from '@/components/shared'
import { RETURN_STATUSES, RETURN_REASONS } from '@/lib/constants'
import { formatDate } from '@/lib/utils'

export default function CustomerReturnsPage() {
  const { customer } = useCustomerAuth()
  const { data: returns, isLoading } = useCustomerReturns(customer?.id ?? '')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Returns</h1>

      {isLoading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : !returns?.length ? (
        <EmptyState
          title="No return requests"
          description="You haven't submitted any return requests yet."
          action={
            <Link to="/account/orders" className="text-primary hover:underline text-sm font-medium">
              View Orders
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {returns.map((ret) => {
            const reasonConfig = RETURN_REASONS.find(r => r.value === ret.reason_category)

            return (
              <Link
                key={ret.id}
                to={`/account/returns/${ret.id}`}
                className="flex items-center gap-4 p-4 rounded-lg border hover:bg-accent transition-colors"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <CodeDisplay code={ret.return_code} />
                    <StatusBadge status={ret.return_status} config={RETURN_STATUSES} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Order: <span className="font-mono">{ret.order_code}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {reasonConfig?.label ?? ret.reason_category}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">{formatDate(ret.created_at)}</p>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
