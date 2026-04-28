import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader, SearchBar, DataTable, StatusBadge, CodeDisplay, TableSkeleton } from '@/components/shared'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TicketTypeBadge } from '@/components/tickets'
import { useTickets, useTicketTypes } from '@/hooks/use-tickets'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { TICKET_STATUSES, TICKET_PRIORITIES } from '@/lib/constants'
import { formatDateTime, cn, formatCustomerName } from '@/lib/utils'

type TicketRow = {
  id: string
  ticket_code: string
  ticket_status: string
  priority: string
  subject: string
  created_at: string
  assigned_staff_id: string | null
  ticket_types: {
    name: string
    label: string
    icon: string
  } | null
  customers: {
    customer_code: string
    last_name: string
    first_name: string
    email: string
  } | null
  orders: {
    order_code: string
  } | null
}

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  ...TICKET_STATUSES.map((s) => ({ value: s.value, label: s.label })),
]

const columns: ColumnDef<TicketRow>[] = [
  {
    accessorKey: 'ticket_code',
    header: 'Ticket',
    cell: ({ row }) => <CodeDisplay code={row.original.ticket_code} />,
  },
  {
    id: 'type',
    header: 'Type',
    cell: ({ row }) => <TicketTypeBadge ticketType={row.original.ticket_types} />,
  },
  {
    accessorKey: 'subject',
    header: 'Subject',
    cell: ({ row }) => (
      <span className="text-sm max-w-[250px] truncate block">{row.original.subject}</span>
    ),
  },
  {
    id: 'customer',
    header: 'Customer',
    cell: ({ row }) => {
      const c = row.original.customers
      if (!c) return '—'
      return (
        <div>
          <span>{formatCustomerName(c)}</span>
          <span className="ml-2 text-xs text-muted-foreground">{c.customer_code}</span>
        </div>
      )
    },
  },
  {
    id: 'order',
    header: 'Order',
    cell: ({ row }) => {
      const o = row.original.orders
      return o ? <CodeDisplay code={o.order_code} /> : '—'
    },
  },
  {
    accessorKey: 'ticket_status',
    header: 'Status',
    cell: ({ row }) => (
      <StatusBadge status={row.original.ticket_status} config={TICKET_STATUSES} />
    ),
  },
  {
    accessorKey: 'priority',
    header: 'Priority',
    cell: ({ row }) => (
      <StatusBadge status={row.original.priority} config={TICKET_PRIORITIES} />
    ),
  },
  {
    accessorKey: 'created_at',
    header: 'Created',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{formatDateTime(row.original.created_at)}</span>
    ),
  },
]

export default function TicketListPage() {
  const navigate = useNavigate()
  const { getParam, setParam } = usePersistedFilters('tickets-filters')
  const search = getParam('q')
  const statusTab = getParam('status', 'all')
  const typeFilter = getParam('type', 'all')
  const priorityFilter = getParam('priority', 'all')
  const setSearch = (v: string) => setParam('q', v)
  const setStatusTab = (v: string) => setParam('status', v, 'all')
  const setTypeFilter = (v: string) => setParam('type', v, 'all')
  const setPriorityFilter = (v: string) => setParam('priority', v, 'all')

  const { data: ticketTypes = [] } = useTicketTypes()

  const { data: allTickets, isLoading } = useTickets({
    search: search || undefined,
    type: typeFilter === 'all' ? undefined : typeFilter,
    priority: priorityFilter === 'all' ? undefined : priorityFilter,
  })

  const tickets = (allTickets ?? []) as TicketRow[]

  // Compute counts per status
  const statusCounts: Record<string, number> = { all: tickets.length }
  for (const t of tickets) {
    statusCounts[t.ticket_status] = (statusCounts[t.ticket_status] ?? 0) + 1
  }

  // Filter by active tab
  const filteredTickets = statusTab === 'all'
    ? tickets
    : tickets.filter((t) => t.ticket_status === statusTab)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        description="Manage customer support tickets."
      />

      {/* Status Tabs */}
      <div className="border-b">
        <nav className="flex gap-0 -mb-px overflow-x-auto">
          {STATUS_TABS.map((tab) => {
            const count = statusCounts[tab.value] ?? 0
            const isActive = statusTab === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatusTab(tab.value)}
                className={cn(
                  'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    'ml-1.5 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by ticket code or subject..."
          className="flex-1 min-w-[300px]"
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {ticketTypes.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {TICKET_PRIORITIES.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} columns={8} />
      ) : (
        <DataTable
          columns={columns}
          data={filteredTickets}
          onRowClick={(row) => navigate(`/admin/tickets/${row.id}`)}
        />
      )}
    </div>
  )
}
