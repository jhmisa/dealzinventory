import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader, SearchBar, DataTable, StatusBadge, GradeBadge, CodeDisplay, PriceDisplay, TableSkeleton } from '@/components/shared'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useOrders } from '@/hooks/use-orders'
import { ORDER_STATUSES, ORDER_SOURCES } from '@/lib/constants'
import { formatDateTime } from '@/lib/utils'

type OrderRow = {
  id: string
  order_code: string
  order_source: string
  order_status: string
  quantity: number
  total_price: number
  shipping_address: string
  created_at: string
  customers: { customer_code: string; last_name: string; first_name: string | null } | null
  sell_groups: {
    sell_group_code: string
    condition_grade: string
    base_price: number
    product_models: { brand: string; model_name: string } | null
  } | null
  order_items: { count: number }[]
}

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
      return c ? `${c.last_name} ${c.first_name ?? ''}`.trim() : '—'
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
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  const { data: orders, isLoading } = useOrders({
    search: search || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    source: sourceFilter === 'all' ? undefined : sourceFilter,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Manage customer orders."
      />

      <div className="flex items-center gap-4 flex-wrap">
        <SearchBar value={search} onChange={setSearch} placeholder="Search ORD-code..." />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ORDER_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          data={(orders ?? []) as OrderRow[]}
          onRowClick={(row) => navigate(`/admin/orders/${row.id}`)}
        />
      )}
    </div>
  )
}
