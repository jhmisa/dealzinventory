import { useNavigate } from 'react-router-dom'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/shared/status-badge'
import { TicketTypeBadge } from './ticket-type-badge'
import { TICKET_STATUSES, TICKET_PRIORITIES } from '@/lib/constants'
import { formatDate, formatCustomerName } from '@/lib/utils'

interface TicketRow {
  id: string
  ticket_code: string
  ticket_status: string
  priority: string
  subject: string
  created_at: string
  assigned_staff_id: string | null
  ticket_types: { name: string; label: string; icon: string } | null
  customers?: { customer_code: string; last_name: string; first_name: string; email?: string } | null
  orders?: { order_code: string } | null
}

interface TicketListTableProps {
  tickets: TicketRow[]
  showCustomer?: boolean
  compact?: boolean
}

export function TicketListTable({ tickets, showCustomer = true, compact = false }: TicketListTableProps) {
  const navigate = useNavigate()

  if (tickets.length === 0) {
    return <p className="text-sm text-muted-foreground py-4 text-center">No tickets found.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Subject</TableHead>
          {showCustomer && <TableHead>Customer</TableHead>}
          {!compact && <TableHead>Order</TableHead>}
          <TableHead>Status</TableHead>
          {!compact && <TableHead>Priority</TableHead>}
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tickets.map((ticket) => (
          <TableRow
            key={ticket.id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => navigate(`/admin/tickets/${ticket.id}`)}
          >
            <TableCell className="font-mono text-sm">{ticket.ticket_code}</TableCell>
            <TableCell>
              <TicketTypeBadge ticketType={ticket.ticket_types} />
            </TableCell>
            <TableCell className="max-w-[200px] truncate">{ticket.subject}</TableCell>
            {showCustomer && (
              <TableCell className="text-sm">
                {ticket.customers
                  ? formatCustomerName(ticket.customers.last_name, ticket.customers.first_name)
                  : '—'}
              </TableCell>
            )}
            {!compact && (
              <TableCell className="font-mono text-sm">
                {ticket.orders?.order_code ?? '—'}
              </TableCell>
            )}
            <TableCell>
              <StatusBadge status={ticket.ticket_status} config={TICKET_STATUSES} />
            </TableCell>
            {!compact && (
              <TableCell>
                <StatusBadge status={ticket.priority} config={TICKET_PRIORITIES} />
              </TableCell>
            )}
            <TableCell className="text-sm text-muted-foreground">
              {formatDate(ticket.created_at)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
