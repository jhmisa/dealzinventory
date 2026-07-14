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
import { TicketTypeBadge, TicketQueue } from '@/components/tickets'
import { useTickets, useTicketTypes, useTicketQueue } from '@/hooks/use-tickets'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { TICKET_STATUSES, TICKET_PRIORITIES } from '@/lib/constants'
import { attentionCount, todayJst } from '@/lib/ticket-followups'
import { formatDateTime, cn, formatCustomerName } from '@/lib/utils'

type TicketRow = {
  id: string
  ticket_code: string
  ticket_status: string
  priority: string
  subject: string
  created_at: string
  follow_up_at: string | null
  assigned_staff_id: string | null
  ticket_types: {
    name: string
    label: string
    icon: string
    kind?: 'problem' | 'followup'
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
  conversations: {
    contact_name: string | null
  } | null
}

const STATUS_TABS = [
  { value: 'queue', label: 'Queue' },
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
      if (c) {
        return (
          <div>
            <span>{formatCustomerName(c)}</span>
            <span className="ml-2 text-xs text-muted-foreground">{c.customer_code}</span>
          </div>
        )
      }
      // No linked customer: fall back to the conversation's contact name so the
      // list matches the messaging panel and ticket-detail page (e.g. "Ra Chel")
      // instead of a misleading "—". See docs/investigations/incorrect-ticket-linking.md.
      const contactName = row.original.conversations?.contact_name
      if (contactName) {
        return <span className="text-sm italic text-muted-foreground">{contactName}</span>
      }
      return '—'
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
    accessorKey: 'follow_up_at',
    header: 'Follow-up',
    cell: ({ row }) => {
      const due = row.original.follow_up_at
      if (!due) return <span className="text-xs text-muted-foreground">—</span>
      const isOpen = row.original.ticket_status === 'OPEN' || row.original.ticket_status === 'IN_PROGRESS'
      const today = todayJst()
      return (
        <span
          className={cn(
            'text-xs',
            isOpen && due < today && 'font-medium text-red-600',
            isOpen && due === today && 'font-medium text-amber-600',
            (!isOpen || due > today) && 'text-muted-foreground',
          )}
        >
          {due}
          {isOpen && due < today && ' ⚠'}
          {isOpen && due === today && ' · today'}
        </span>
      )
    },
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
  const statusTab = getParam('status', 'queue')
  const typeFilter = getParam('type', 'all')
  const priorityFilter = getParam('priority', 'all')
  const setSearch = (v: string) => setParam('q', v)
  const setStatusTab = (v: string) => setParam('status', v, 'all')
  const setTypeFilter = (v: string) => setParam('type', v, 'all')
  const setPriorityFilter = (v: string) => setParam('priority', v, 'all')

  const { data: ticketTypes = [] } = useTicketTypes()

  const isQueue = statusTab === 'queue'

  const { data: allTickets, isLoading } = useTickets({
    search: search || undefined,
    type: typeFilter === 'all' ? undefined : typeFilter,
    priority: priorityFilter === 'all' ? undefined : priorityFilter,
  })

  const { data: queueTickets = [], isLoading: queueLoading } = useTicketQueue()

  const tickets = (allTickets ?? []) as TicketRow[]

  // Queue respects the same search/type/priority filters, applied client-side
  const q = search.trim().toLowerCase()
  const filteredQueue = queueTickets.filter((t) =>
    (!q || t.ticket_code.toLowerCase().includes(q) || t.subject.toLowerCase().includes(q)) &&
    (typeFilter === 'all' || t.ticket_types?.id === typeFilter) &&
    (priorityFilter === 'all' || t.priority === priorityFilter),
  )

  // Compute counts per status
  const statusCounts: Record<string, number> = {
    all: tickets.length,
    queue: attentionCount(queueTickets.map((t) => ({
      priority: t.priority,
      created_at: t.created_at,
      follow_up_at: t.follow_up_at,
      kind: t.ticket_types?.kind ?? 'problem',
    }))),
  }
  for (const t of tickets) {
    statusCounts[t.ticket_status] = (statusCounts[t.ticket_status] ?? 0) + 1
  }

  // Filter by active tab
  const filteredTickets = statusTab === 'all' || isQueue
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
                    tab.value === 'queue' && count > 0
                      ? 'bg-destructive text-white'
                      : isActive
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

      {isQueue ? (
        queueLoading ? (
          <TableSkeleton rows={8} columns={5} />
        ) : (
          <TicketQueue tickets={filteredQueue} />
        )
      ) : isLoading ? (
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
