import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { PageHeader, DataTable, SearchBar, StatusBadge, CodeDisplay } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useKaitoriRequests } from '@/hooks/use-kaitori'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { KAITORI_STATUSES, getKaitoriStatusConfig } from '@/lib/constants'
import { formatPrice, formatDateTime, formatCustomerName } from '@/lib/utils'
import type { KaitoriStatus } from '@/lib/types'

type KaitoriRow = {
  id: string
  kaitori_code: string
  request_status: KaitoriStatus
  auto_quote_price: number
  final_price: number | null
  delivery_method: string
  created_at: string
  customers: { last_name: string; first_name: string | null; customer_code: string } | null
  product_models: { brand: string; model_name: string; cpu: string | null; ram_gb: string | null; storage_gb: string | null } | null
}

const columns: ColumnDef<KaitoriRow>[] = [
  {
    accessorKey: 'kaitori_code',
    header: 'KT-Code',
    cell: ({ row }) => <CodeDisplay code={row.original.kaitori_code} />,
  },
  {
    id: 'customer',
    header: 'Seller',
    cell: ({ row }) => {
      const c = row.original.customers
      return c ? formatCustomerName(c) : '—'
    },
  },
  {
    id: 'product',
    header: 'Device',
    cell: ({ row }) => {
      const pm = row.original.product_models
      return pm ? `${pm.brand} ${pm.model_name}` : '—'
    },
  },
  {
    id: 'config',
    header: 'Config',
    cell: ({ row }) => {
      const pm = row.original.product_models
      if (!pm) return '—'
      return `${pm.cpu ?? ''} / ${pm.ram_gb ?? '?'} / ${pm.storage_gb ?? '?'}`
    },
  },
  {
    id: 'price',
    header: 'Quote / Final',
    cell: ({ row }) => {
      const r = row.original
      return (
        <div className="text-sm">
          <span>{formatPrice(r.auto_quote_price)}</span>
          {r.final_price != null && r.final_price !== r.auto_quote_price && (
            <span className="ml-2 font-semibold text-primary">→ {formatPrice(r.final_price)}</span>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: 'delivery_method',
    header: 'Delivery',
    cell: ({ row }) => row.original.delivery_method === 'SHIP' ? 'Ship' : 'Walk-in',
  },
  {
    accessorKey: 'request_status',
    header: 'Status',
    cell: ({ row }) => {
      const cfg = getKaitoriStatusConfig(row.original.request_status)
      return <StatusBadge label={cfg.label} color={cfg.color} />
    },
  },
  {
    accessorKey: 'created_at',
    header: 'Created',
    cell: ({ row }) => formatDateTime(row.original.created_at),
  },
]

export default function KaitoriListPage() {
  const navigate = useNavigate()
  const { getParam, setParam } = usePersistedFilters('kaitori-filters')
  const search = getParam('q')
  const statusTab = getParam('status', 'all')
  const setSearch = (v: string) => setParam('q', v)
  const setStatusTab = (v: string) => setParam('status', v, 'all')

  const { data: requests, isLoading } = useKaitoriRequests({
    search: search || undefined,
    status: statusTab === 'all' ? undefined : statusTab,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kaitori Requests"
        description="Manage buy-from-individual (買取) requests."
      />

      <Tabs value={statusTab} onValueChange={setStatusTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">All</TabsTrigger>
          {KAITORI_STATUSES.map((s) => (
            <TabsTrigger key={s.value} value={s.value}>{s.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by KT-code..."
      />

      <DataTable
        columns={columns}
        data={(requests ?? []) as KaitoriRow[]}
        isLoading={isLoading}
        onRowClick={(row) => navigate(`/admin/kaitori/${row.id}`)}
      />
    </div>
  )
}
