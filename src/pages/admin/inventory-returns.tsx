import { useNavigate, useSearchParams } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader, SearchBar, DataTable, StatusBadge, CodeDisplay, TableSkeleton } from '@/components/shared'
import { useSupplierReturns } from '@/hooks/use-supplier-returns'
import { useInventoryRemovals } from '@/hooks/use-inventory-removals'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import {
  SUPPLIER_RETURN_STATUSES,
  SUPPLIER_RETURN_RESOLUTIONS,
  INVENTORY_REMOVAL_STATUSES,
  INVENTORY_REMOVAL_REASONS,
} from '@/lib/constants'
import { formatDateTime, cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

// ── Supplier Returns types & columns ──

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

const SR_STATUS_TABS = [
  { value: 'all', label: 'All' },
  ...SUPPLIER_RETURN_STATUSES.map((s) => ({ value: s.value, label: s.label })),
]

const supplierReturnColumns: ColumnDef<SupplierReturnRow>[] = [
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

// ── Inventory Removals types & columns ──

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

const RM_STATUS_TABS = [
  { value: 'all', label: 'All' },
  ...INVENTORY_REMOVAL_STATUSES.map((s) => ({ value: s.value, label: s.label })),
]

const removalColumns: ColumnDef<RemovalRow>[] = [
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

// ── Status filter bar (reusable within each tab) ──

function StatusFilterBar({
  tabs,
  counts,
  activeTab,
  onTabChange,
}: {
  tabs: { value: string; label: string }[]
  counts: Record<string, number>
  activeTab: string
  onTabChange: (v: string) => void
}) {
  return (
    <div className="border-b">
      <nav className="flex gap-0 -mb-px overflow-x-auto">
        {tabs.map((tab) => {
          const count = counts[tab.value] ?? 0
          const isActive = activeTab === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onTabChange(tab.value)}
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
  )
}

// ── Supplier Returns Tab ──

function SupplierReturnsTab() {
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

  const statusCounts: Record<string, number> = { all: returns.length }
  for (const ret of returns) {
    statusCounts[ret.return_status] = (statusCounts[ret.return_status] ?? 0) + 1
  }

  const filteredReturns = statusTab === 'all'
    ? returns
    : returns.filter((r) => r.return_status === statusTab)

  return (
    <div className="space-y-6">
      <StatusFilterBar
        tabs={SR_STATUS_TABS}
        counts={statusCounts}
        activeTab={statusTab}
        onTabChange={setStatusTab}
      />
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
          columns={supplierReturnColumns}
          data={filteredReturns}
          onRowClick={(row) => navigate(`/admin/inventory-returns/supplier/${row.id}`)}
        />
      )}
    </div>
  )
}

// ── Removals Tab ──

function RemovalsTab() {
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
      <StatusFilterBar
        tabs={RM_STATUS_TABS}
        counts={statusCounts}
        activeTab={statusTab}
        onTabChange={setStatusTab}
      />
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
          columns={removalColumns}
          data={filteredRemovals}
          onRowClick={(row) => navigate(`/admin/inventory-returns/removals/${row.id}`)}
        />
      )}
    </div>
  )
}

// ── Main Page ──

export default function InventoryReturnsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = searchParams.get('tab') === 'removals' ? 'removals' : 'supplier'

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value }, { replace: true })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Returns"
        description="Supplier returns and inventory removals."
      />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="supplier">Supplier Returns</TabsTrigger>
          <TabsTrigger value="removals">Removals</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'supplier' ? <SupplierReturnsTab /> : <RemovalsTab />}
    </div>
  )
}
