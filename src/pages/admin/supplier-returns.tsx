import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader, SearchBar, DataTable, StatusBadge, CodeDisplay, TableSkeleton } from '@/components/shared'
import { useSupplierReturns } from '@/hooks/use-supplier-returns'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { SUPPLIER_RETURN_STATUSES, SUPPLIER_RETURN_RESOLUTIONS } from '@/lib/constants'
import { formatDateTime, cn } from '@/lib/utils'

type SupplierReturnRow = {
  id: string
  return_code: string
  reason: string
  return_status: string
  resolution: string | null
  created_at: string
  items: {
    item_code: string
    brand: string | null
    model_name: string | null
  } | null
  suppliers: {
    supplier_name: string
  } | null
}

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  ...SUPPLIER_RETURN_STATUSES.map((s) => ({ value: s.value, label: s.label })),
]

const columns: ColumnDef<SupplierReturnRow>[] = [
  {
    accessorKey: 'return_code',
    header: 'SR Code',
    cell: ({ row }) => <CodeDisplay code={row.original.return_code} />,
  },
  {
    id: 'item',
    header: 'Item',
    cell: ({ row }) => {
      const item = row.original.items
      if (!item) return '—'
      return (
        <div>
          <CodeDisplay code={item.item_code} />
          {(item.brand || item.model_name) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {[item.brand, item.model_name].filter(Boolean).join(' ')}
            </p>
          )}
        </div>
      )
    },
  },
  {
    id: 'supplier',
    header: 'Supplier',
    cell: ({ row }) => (
      <span className="text-sm">{row.original.suppliers?.supplier_name ?? '—'}</span>
    ),
  },
  {
    accessorKey: 'reason',
    header: 'Reason',
    cell: ({ row }) => (
      <span className="text-sm truncate max-w-[200px] block">
        {row.original.reason}
      </span>
    ),
  },
  {
    accessorKey: 'return_status',
    header: 'Status',
    cell: ({ row }) => (
      <StatusBadge status={row.original.return_status} config={SUPPLIER_RETURN_STATUSES} />
    ),
  },
  {
    id: 'resolution',
    header: 'Resolution',
    cell: ({ row }) => {
      if (!row.original.resolution) return '—'
      const r = SUPPLIER_RETURN_RESOLUTIONS.find(res => res.value === row.original.resolution)
      return <span className="text-sm">{r?.label ?? row.original.resolution}</span>
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

export default function SupplierReturnsPage() {
  const navigate = useNavigate()
  const { getParam, setParam } = usePersistedFilters('supplier-returns-filters')
  const search = getParam('q')
  const statusTab = getParam('status', 'all')
  const setSearch = (v: string) => setParam('q', v)
  const setStatusTab = (v: string) => setParam('status', v, 'all')

  const { data: allReturns, isLoading } = useSupplierReturns({
    search: search || undefined,
  })

  const returns = (allReturns ?? []) as SupplierReturnRow[]

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
        title="Supplier Returns"
        description="Track items returned to suppliers for exchange or refund."
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

      {/* Search */}
      <div className="flex items-center gap-4 flex-wrap">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by SR code..."
          className="flex-1 min-w-[300px]"
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} columns={7} />
      ) : (
        <DataTable
          columns={columns}
          data={filteredReturns}
          onRowClick={(row) => navigate(`/admin/supplier-returns/${row.id}`)}
        />
      )}
    </div>
  )
}
