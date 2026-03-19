import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { PageHeader, SearchBar, DataTable, StatusBadge, CodeDisplay, PriceDisplay, TableSkeleton } from '@/components/shared'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useOrders } from '@/hooks/use-orders'
import { ORDER_STATUSES, ORDER_SOURCES } from '@/lib/constants'
import { formatDateTime, cn } from '@/lib/utils'

type OrderRow = {
  id: string
  order_code: string
  order_source: string
  order_status: string
  quantity: number
  total_price: number
  shipping_address: string
  created_at: string
  customers: { customer_code: string; last_name: string; first_name: string | null; email: string | null; phone: string | null } | null
  sell_groups: {
    sell_group_code: string
    condition_grade: string
    base_price: number
    product_models: { brand: string; model_name: string } | null
  } | null
  order_items: { count: number }[]
}

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  ...ORDER_STATUSES.map((s) => ({ value: s.value, label: s.label })),
]

const columns: ColumnDef<OrderRow>[] = [
  {
    accessorKey: 'order_code',
    header: 'Order',
    cell: ({ row }) => <CodeDisplay code={row.original.order_code} />,
  },
  {
    id: 'customer',
    header: 'Customer',
    cell: ({ row }) => {
      const c = row.original.customers
      if (!c) return '—'
      return (
        <div>
          <span>{`${c.last_name} ${c.first_name ?? ''}`.trim()}</span>
          <span className="ml-2 text-xs text-muted-foreground">{c.customer_code}</span>
        </div>
      )
    },
  },
  {
    id: 'product',
    header: 'Product',
    cell: ({ row }) => {
      const sg = row.original.sell_groups
      const pm = sg?.product_models
      return pm ? `${pm.brand} ${pm.model_name}` : sg?.sell_group_code ?? '—'
    },
  },
  {
    accessorKey: 'quantity',
    header: 'Qty',
  },
  {
    accessorKey: 'total_price',
    header: 'Total',
    cell: ({ row }) => <PriceDisplay amount={row.original.total_price} />,
  },
  {
    accessorKey: 'order_source',
    header: 'Source',
    cell: ({ row }) => {
      const src = ORDER_SOURCES.find(s => s.value === row.original.order_source)
      return <span className="text-sm">{src?.label ?? row.original.order_source}</span>
    },
  },
  {
    accessorKey: 'order_status',
    header: 'Status',
    cell: ({ row }) => {
      const cfg = ORDER_STATUSES.find(s => s.value === row.original.order_status)
      return cfg ? <StatusBadge label={cfg.label} color={cfg.color} /> : row.original.order_status
    },
  },
  {
    accessorKey: 'created_at',
    header: 'Created',
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDateTime(row.original.created_at)}</span>,
  },
]

export default function OrderListPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusTab, setStatusTab] = useState('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  // Fetch all orders (no status filter) so we can compute tab counts
  const { data: allOrders, isLoading } = useOrders({
    search: search || undefined,
    source: sourceFilter === 'all' ? undefined : sourceFilter,
  })

  const orders = (allOrders ?? []) as OrderRow[]

  // Compute counts per status
  const statusCounts: Record<string, number> = { all: orders.length }
  for (const order of orders) {
    statusCounts[order.order_status] = (statusCounts[order.order_status] ?? 0) + 1
  }

  // Filter by active tab
  const filteredOrders = statusTab === 'all'
    ? orders
    : orders.filter((o) => o.order_status === statusTab)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Manage customer orders."
        actions={
          <Button asChild>
            <Link to="/admin/orders/new">
              <Plus className="h-4 w-4 mr-1" />
              Create Order
            </Link>
          </Button>
        }
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

      {/* Search & Source Filter */}
      <div className="flex items-center gap-4 flex-wrap">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by order code, customer name, code, email, phone..."
          className="flex-1 min-w-[300px]"
        />
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {ORDER_SOURCES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} columns={8} />
      ) : (
        <DataTable
          columns={columns}
          data={filteredOrders}
          onRowClick={(row) => navigate(`/admin/orders/${row.id}`)}
        />
      )}
    </div>
  )
}
