import { Link } from 'react-router-dom'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { useCustomerTickets, useTicketTypes } from '@/hooks/use-tickets'
import { StatusBadge, CodeDisplay, TableSkeleton, EmptyState } from '@/components/shared'
import { TicketTypeBadge } from '@/components/tickets'
import { TICKET_STATUSES } from '@/lib/constants'
import { formatDate } from '@/lib/utils'

export default function CustomerTicketsPage() {
  const { customer } = useCustomerAuth()
  const { data: tickets, isLoading } = useCustomerTickets(customer?.id ?? '')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Tickets</h1>

      {isLoading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : !tickets?.length ? (
        <EmptyState
          title="No tickets"
          description="You haven't submitted any support tickets yet."
          action={
            <Link to="/account/orders" className="text-primary hover:underline text-sm font-medium">
              View Orders
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => (
            <Link
              key={ticket.id}
              to={`/account/tickets/${ticket.id}`}
              className="flex items-center gap-4 p-4 rounded-lg border hover:bg-accent transition-colors"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <CodeDisplay code={ticket.ticket_code} />
                  <TicketTypeBadge ticketType={ticket.ticket_types} />
                  <StatusBadge status={ticket.ticket_status} config={TICKET_STATUSES} />
                </div>
                <p className="text-sm font-medium">{ticket.subject}</p>
                {ticket.orders?.order_code && (
                  <p className="text-sm text-muted-foreground">
                    Order: <span className="font-mono">{ticket.orders.order_code}</span>
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs text-muted-foreground">{formatDate(ticket.created_at)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
