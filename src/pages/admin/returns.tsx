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
import { useReturns } from '@/hooks/use-returns'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { RETURN_STATUSES, RETURN_REASONS } from '@/lib/constants'
import { formatDateTime, cn, formatCustomerName } from '@/lib/utils'

type ReturnRow = {
  id: string
  return_code: string
  reason_category: string
  return_status: string
  description: string
  created_at: string
  orders: {
    order_code: string
  } | null
  customers: {
    customer_code: string
    last_name: string
    first_name: string | null
  } | null
  return_request_items: { count: number }[]
}

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  ...RETURN_STATUSES.map((s) => ({ value: s.value, label: s.label })),
]

const columns: ColumnDef<ReturnRow>[] = [
  {
    accessorKey: 'return_code',
    header: 'Return',
    cell: ({ row }) => <CodeDisplay code={row.original.return_code} />,
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
    accessorKey: 'reason_category',
    header: 'Reason',
    cell: ({ row }) => {
      const reason = RETURN_REASONS.find(r => r.value === row.original.reason_category)
      return <span className="text-sm">{reason?.label ?? row.original.reason_category}</span>
    },
  },
  {
    id: 'items',
    header: 'Items',
    cell: ({ row }) => {
      const count = row.original.return_request_items?.[0]?.count ?? 0
      return <span className="text-sm">{count}</span>
    },
  },
  {
    accessorKey: 'return_status',
    header: 'Status',
    cell: ({ row }) => (
      <StatusBadge status={row.original.return_status} config={RETURN_STATUSES} />
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

export default function ReturnListPage() {
  const navigate = useNavigate()
  const { getParam, setParam } = usePersistedFilters('returns-filters')
  const search = getParam('q')
  const statusTab = getParam('status', 'all')
  const reasonFilter = getParam('reason', 'all')
  const setSearch = (v: string) => setParam('q', v)
  const setStatusTab = (v: string) => setParam('status', v, 'all')
  const setReasonFilter = (v: string) => setParam('reason', v, 'all')

  const { data: allReturns, isLoading } = useReturns({
    search: search || undefined,
    status: undefined,
    reason: reasonFilter === 'all' ? undefined : reasonFilter,
  })

  const returns = (allReturns ?? []) as ReturnRow[]

  // Compute counts per status
  const statusCounts: Record<string, number> = { all: returns.length }
  for (const ret of returns) {
    statusCounts[ret.return_status] = (statusCounts[ret.return_status] ?? 0) + 1
  }

  // Filter by active tab
  const filteredReturns = statusTab === 'all'
    ? returns
    : returns.filter((r) => r.return_status === statusTab)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Returns"
        description="Manage customer return requests."
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

      {/* Search & Reason Filter */}
      <div className="flex items-center gap-4 flex-wrap">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by return code..."
          className="flex-1 min-w-[300px]"
        />
        <Select value={reasonFilter} onValueChange={setReasonFilter}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Reason" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reasons</SelectItem>
            {RETURN_REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} columns={7} />
      ) : (
        <DataTable
          columns={columns}
          data={filteredReturns}
          onRowClick={(row) => navigate(`/admin/returns/${row.id}`)}
        />
      )}
    </div>
  )
}
