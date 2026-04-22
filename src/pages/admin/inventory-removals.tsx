import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader, SearchBar, DataTable, StatusBadge, CodeDisplay, TableSkeleton } from '@/components/shared'
import { useInventoryRemovals } from '@/hooks/use-inventory-removals'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { INVENTORY_REMOVAL_STATUSES, INVENTORY_REMOVAL_REASONS } from '@/lib/constants'
import { formatDateTime, cn } from '@/lib/utils'

type RemovalRow = {
  id: string
  removal_code: string
  reason: string
  reason_text: string | null
  removal_status: string
  requested_at: string
  items: {
    item_code: string
    brand: string | null
    model_name: string | null
  } | null
}

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  ...INVENTORY_REMOVAL_STATUSES.map((s) => ({ value: s.value, label: s.label })),
]

const columns: ColumnDef<RemovalRow>[] = [
  {
    accessorKey: 'removal_code',
    header: 'RM Code',
    cell: ({ row }) => <CodeDisplay code={row.original.removal_code} />,
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
    id: 'reason',
    header: 'Reason',
    cell: ({ row }) => {
      const reason = INVENTORY_REMOVAL_REASONS.find(r => r.value === row.original.reason)
      const text = row.original.reason === 'OTHER' ? row.original.reason_text : reason?.label
      return <span className="text-sm">{text ?? row.original.reason}</span>
    },
  },
  {
    accessorKey: 'removal_status',
    header: 'Status',
    cell: ({ row }) => (
      <StatusBadge status={row.original.removal_status} config={INVENTORY_REMOVAL_STATUSES} />
    ),
  },
  {
    accessorKey: 'requested_at',
    header: 'Requested',
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground">{formatDateTime(row.original.requested_at)}</span>
    ),
  },
]

export default function InventoryRemovalsPage() {
  const navigate = useNavigate()
  const { getParam, setParam } = usePersistedFilters('inventory-removals-filters')
  const search = getParam('q')
  const statusTab = getParam('status', 'all')
  const setSearch = (v: string) => setParam('q', v)
  const setStatusTab = (v: string) => setParam('status', v, 'all')

  const { data: allRemovals, isLoading } = useInventoryRemovals({
    search: search || undefined,
  })

  const removals = (allRemovals ?? []) as RemovalRow[]

  const statusCounts: Record<string, number> = { all: removals.length }
  for (const rm of removals) {
    statusCounts[rm.removal_status] = (statusCounts[rm.removal_status] ?? 0) + 1
  }

  const filteredRemovals = statusTab === 'all'
    ? removals
    : removals.filter((r) => r.removal_status === statusTab)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Removals"
        description="Track items removed from inventory."
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
          placeholder="Search by RM code..."
          className="flex-1 min-w-[300px]"
        />
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} columns={5} />
      ) : (
        <DataTable
          columns={columns}
          data={filteredRemovals}
          onRowClick={(row) => navigate(`/admin/inventory-removals/${row.id}`)}
        />
      )}
    </div>
  )
}
