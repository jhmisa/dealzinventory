import { useNavigate, Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Copy, X } from 'lucide-react'
import { toast } from 'sonner'
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
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { useOffers, useCancelOffer } from '@/hooks/use-offers'
import { ORDER_STATUSES, ORDER_SOURCES, OFFER_STATUSES } from '@/lib/constants'
import { formatDateTime, formatPrice, cn } from '@/lib/utils'

type OrderRow = {
  id: string
  order_code: string
  order_source: string
  order_status: string
  quantity: number
  total_price: number
  shipping_address: string
  delivery_date: string | null
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

const OFFER_STATUS_TABS = [
  { value: 'all', label: 'All' },
  ...OFFER_STATUSES.map((s) => ({ value: s.value, label: s.label })),
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
      return pm ? `${pm.brand} ${pm.model_name}${pm.short_description ? ' — ' + pm.short_description : ''}` : sg?.sell_group_code ?? '—'
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
    accessorKey: 'delivery_date',
    header: 'Delivery',
    cell: ({ row }) => {
      const dd = row.original.delivery_date
      if (!dd) return <span className="text-xs text-muted-foreground">—</span>
      const today = new Date().toISOString().split('T')[0]
      const isToday = dd === today
      const isPast = dd < today
      return (
        <span className={cn(
          'text-xs',
          isPast && row.original.order_status !== 'DELIVERED' && row.original.order_status !== 'SHIPPED' && row.original.order_status !== 'CANCELLED'
            ? 'text-red-600 font-medium'
            : isToday ? 'text-orange-600 font-medium' : 'text-muted-foreground',
        )}>
          {dd}
        </span>
      )
    },
  },
  {
    accessorKey: 'created_at',
    header: 'Created',
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{formatDateTime(row.original.created_at)}</span>,
  },
]

// --- Offers Tab Types ---

type OfferRow = {
  id: string
  offer_code: string
  offer_status: string
  fb_name: string
  notes: string | null
  expires_at: string
  created_at: string
  offer_items: { id: string; item_id: string | null; description: string; unit_price: number; quantity: number }[]
}

export default function OrderListPage() {
  const navigate = useNavigate()
  const { getParam, setParam, setParams } = usePersistedFilters('orders-filters')
  const search = getParam('q')
  const statusTab = getParam('status', 'all')
  const sourceFilter = getParam('source', 'all')
  const mainTab = getParam('tab', 'orders') as 'orders' | 'offers'
  const setSearch = (v: string) => setParam('q', v)
  const setStatusTab = (v: string) => setParam('status', v, 'all')
  const setSourceFilter = (v: string) => setParam('source', v, 'all')
  const setMainTab = (v: 'orders' | 'offers') => setParam('tab', v, 'orders')

  // Fetch all orders (no status filter) so we can compute tab counts
  const { data: allOrders, isLoading } = useOrders({
    search: mainTab === 'orders' ? search || undefined : undefined,
    source: sourceFilter === 'all' ? undefined : sourceFilter,
  })

  // Fetch offers
  const { data: allOffers, isLoading: offersLoading } = useOffers({
    search: mainTab === 'offers' ? search || undefined : undefined,
  })

  const cancelOffer = useCancelOffer()

  const orders = (allOrders ?? []) as OrderRow[]
  const offers = (allOffers ?? []) as OfferRow[]

  const pendingOffersCount = offers.filter(o => o.offer_status === 'PENDING').length

  // Compute counts per status
  const statusCounts: Record<string, number> = { all: orders.length }
  for (const order of orders) {
    statusCounts[order.order_status] = (statusCounts[order.order_status] ?? 0) + 1
  }

  // Compute offer counts per status
  const offerStatusCounts: Record<string, number> = { all: offers.length }
  for (const offer of offers) {
    offerStatusCounts[offer.offer_status] = (offerStatusCounts[offer.offer_status] ?? 0) + 1
  }

  // Filter by active tab
  const filteredOrders = statusTab === 'all'
    ? orders
    : orders.filter((o) => o.order_status === statusTab)

  const filteredOffers = statusTab === 'all'
    ? offers
    : offers.filter((o) => o.offer_status === statusTab)

  // Offers table columns
  const offerColumns: ColumnDef<OfferRow>[] = [
    {
      accessorKey: 'offer_code',
      header: 'Offer',
      cell: ({ row }) => <CodeDisplay code={row.original.offer_code} />,
    },
    {
      accessorKey: 'fb_name',
      header: 'FB Name',
      cell: ({ row }) => <span className="font-medium">{row.original.fb_name}</span>,
    },
    {
      id: 'items',
      header: 'Items',
      cell: ({ row }) => {
        const items = row.original.offer_items ?? []
        const count = items.length
        const summary = items.slice(0, 2).map(i => i.description).join(', ')
        return (
          <div>
            <span className="text-sm">{count} item{count !== 1 ? 's' : ''}</span>
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{summary}</p>
          </div>
        )
      },
    },
    {
      id: 'total',
      header: 'Total',
      cell: ({ row }) => {
        const total = (row.original.offer_items ?? []).reduce(
          (sum, oi) => sum + Number(oi.unit_price) * oi.quantity, 0
        )
        return <PriceDisplay amount={total} />
      },
    },
    {
      id: 'expires',
      header: 'Expires',
      cell: ({ row }) => {
        if (row.original.offer_status !== 'PENDING') return '—'
        const expiresAt = new Date(row.original.expires_at)
        const now = new Date()
        const hoursLeft = Math.max(0, Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60)))
        return (
          <span className={cn('text-sm', hoursLeft < 6 ? 'text-red-600 font-medium' : 'text-muted-foreground')}>
            {hoursLeft}h left
          </span>
        )
      },
    },
    {
      accessorKey: 'offer_status',
      header: 'Status',
      cell: ({ row }) => {
        const cfg = OFFER_STATUSES.find(s => s.value === row.original.offer_status)
        return cfg ? <StatusBadge label={cfg.label} color={cfg.color} /> : row.original.offer_status
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const offer = row.original
        const offerUrl = `${window.location.origin}/offer/${offer.offer_code}`
        return (
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                navigator.clipboard.writeText(offerUrl)
                toast.success('Link copied!')
              }}
              title="Copy link"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            {offer.offer_status === 'PENDING' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-600 hover:text-red-700"
                onClick={() => cancelOffer.mutate(offer.id, {
                  onSuccess: () => toast.success('Offer cancelled'),
                  onError: (err) => toast.error(err.message),
                })}
                title="Cancel offer"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Manage customer orders and offers."
        actions={
          <Button asChild>
            <Link to="/admin/orders/new">
              <Plus className="h-4 w-4 mr-1" />
              Create Order
            </Link>
          </Button>
        }
      />

      {/* Main tabs: Orders | Offers */}
      <div className="border-b">
        <nav className="flex gap-0 -mb-px">
          <button
            type="button"
            onClick={() => setParams({ tab: { value: 'orders', defaultValue: 'orders' }, q: { value: '' } })}
            className={cn(
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
              mainTab === 'orders'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
            )}
          >
            Orders
          </button>
          <button
            type="button"
            onClick={() => setParams({ tab: { value: 'offers', defaultValue: 'orders' }, q: { value: '' }, status: { value: 'all', defaultValue: 'all' } })}
            className={cn(
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
              mainTab === 'offers'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
            )}
          >
            Offers
            {pendingOffersCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs bg-yellow-100 text-yellow-800">
                {pendingOffersCount}
              </span>
            )}
          </button>
        </nav>
      </div>

      {mainTab === 'orders' ? (
        <>
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
        </>
      ) : (
        <>
          {/* Offer Status Tabs */}
          <div className="border-b">
            <nav className="flex gap-0 -mb-px overflow-x-auto">
              {OFFER_STATUS_TABS.map((tab) => {
                const count = offerStatusCounts[tab.value] ?? 0
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
              placeholder="Search by offer code or FB name..."
              className="flex-1 min-w-[300px]"
            />
          </div>

          {offersLoading ? (
            <TableSkeleton rows={8} columns={7} />
          ) : (
            <DataTable
              columns={offerColumns}
              data={filteredOffers}
              onRowClick={(row) => navigate(`/admin/offers/${row.offer_code}`)}
            />
          )}
        </>
      )}
    </div>
  )
}
