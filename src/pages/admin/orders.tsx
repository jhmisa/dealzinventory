import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Copy, X, Printer, FileSpreadsheet, Upload, AlertTriangle, RefreshCw } from 'lucide-react'
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
import { useOrders, useConfirmedForInvoice, useConfirmedForDempyo, useStampInvoicePrinted, useStampDempyoPrinted, useClearInvoicePrinted, useClearDempyoPrinted, useRefreshAllYamatoStatuses } from '@/hooks/use-orders'
import { usePersistedFilters } from '@/hooks/use-persisted-filters'
import { useOffers, useCancelOffer } from '@/hooks/use-offers'
import { ORDER_STATUSES, ORDER_SOURCES, OFFER_STATUSES, getYamatoStatusConfig } from '@/lib/constants'
import { formatDateTime, formatPrice, formatCustomerName, cn } from '@/lib/utils'
import { printBatchInvoices } from '@/components/orders/batch-invoice-print'
import { validateOrders, generateDempyoXlsx, downloadBlob, generateDempyoFilename } from '@/lib/yamato'
import { YamatoTrackingImportDialog } from '@/components/orders/yamato-tracking-import-dialog'

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
  invoice_printed_at: string | null
  dempyo_printed_at: string | null
  delivery_box_count: number
  yamato_status: string | null
  delivery_issue_flag: boolean
}

function PrintStatusCell({ order }: { order: OrderRow }) {
  const clearInvoice = useClearInvoicePrinted()
  const clearDempyo = useClearDempyoPrinted()

  return (
    <div className="flex items-center gap-2 text-xs" onClick={(e) => e.stopPropagation()}>
      {order.invoice_printed_at ? (
        <button
          type="button"
          title="Click to mark invoice as not printed"
          className="text-green-600 hover:text-red-600 hover:line-through transition-colors"
          onClick={() => clearInvoice.mutate([order.id], {
            onSuccess: () => toast.success('Invoice print status cleared'),
            onError: (err: Error) => toast.error(err.message),
          })}
        >
          ✓ Inv
        </button>
      ) : (
        <span className="text-muted-foreground">— Inv</span>
      )}
      {order.dempyo_printed_at ? (
        <button
          type="button"
          title="Click to mark dempyo as not printed"
          className="text-green-600 hover:text-red-600 hover:line-through transition-colors"
          onClick={() => clearDempyo.mutate([order.id], {
            onSuccess: () => toast.success('Dempyo print status cleared'),
            onError: (err: Error) => toast.error(err.message),
          })}
        >
          ✓ 伝票
        </button>
      ) : (
        <span className="text-muted-foreground">— 伝票</span>
      )}
    </div>
  )
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
          <span>{formatCustomerName(c)}</span>
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
      const yamatoStatusCfg = row.original.order_status === 'SHIPPED' ? getYamatoStatusConfig(row.original.yamato_status) : null
      return (
        <div className="flex items-center gap-1.5">
          {row.original.delivery_issue_flag && (
            <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" title="Delivery issue" />
          )}
          <div>
            {cfg ? <StatusBadge label={cfg.label} color={cfg.color} /> : row.original.order_status}
            {yamatoStatusCfg && (
              <p className="text-[10px] text-muted-foreground mt-0.5">{yamatoStatusCfg.label_en}</p>
            )}
          </div>
        </div>
      )
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
    id: 'print_status',
    header: 'Printed',
    cell: ({ row }) => <PrintStatusCell order={row.original} />,
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
  customers: { id: string; customer_code: string; first_name: string | null; last_name: string; email: string | null; phone: string | null } | null
  orders: { id: string; order_code: string } | null
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

  // Fetch offers (search is applied client-side so it can span joined fields)
  const { data: allOffers, isLoading: offersLoading } = useOffers({})

  const cancelOffer = useCancelOffer()

  const { data: invoiceOrders } = useConfirmedForInvoice(statusTab === 'CONFIRMED')
  const { data: dempyoOrders } = useConfirmedForDempyo(statusTab === 'CONFIRMED')
  const stampInvoice = useStampInvoicePrinted()
  const stampDempyo = useStampDempyoPrinted()
  const [trackingImportOpen, setTrackingImportOpen] = useState(false)
  const [showDeliveryIssuesOnly, setShowDeliveryIssuesOnly] = useState(false)
  const refreshYamato = useRefreshAllYamatoStatuses()

  const invoiceCount = invoiceOrders?.length ?? 0
  const dempyoCount = dempyoOrders?.length ?? 0

  const handleBatchInvoice = () => {
    if (!invoiceOrders || invoiceOrders.length === 0) return
    printBatchInvoices(invoiceOrders, '')
    const ids = invoiceOrders.map((o) => o.id)
    stampInvoice.mutate(ids, {
      onSuccess: () => toast.success(`Marked ${ids.length} invoices as printed`),
      onError: (err) => toast.error(err.message),
    })
  }

  const handleBatchDempyo = async () => {
    if (!dempyoOrders || dempyoOrders.length === 0) return
    const { valid, skipped, warnings } = validateOrders(dempyoOrders)
    if (skipped.length > 0) {
      for (const s of skipped) toast.warning(`${s.order.order_code}: ${s.reason}`)
    }
    for (const w of warnings) toast.warning(`${w.order.order_code}: ${w.message}`)
    if (valid.length === 0) {
      toast.error('No valid orders for dempyo generation')
      return
    }
    try {
      const blob = await generateDempyoXlsx(valid)
      downloadBlob(blob, generateDempyoFilename())
      const ids = valid.map((o) => o.id)
      stampDempyo.mutate(ids, {
        onSuccess: () => toast.success(`Dempyo generated for ${ids.length} orders`),
        onError: (err) => toast.error(err.message),
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate dempyo')
    }
  }

  const orders = (allOrders ?? []) as OrderRow[]
  const offers = (allOffers ?? []) as OfferRow[]

  const pendingOffersCount = offers.filter(o => o.offer_status === 'PENDING').length

  // Compute counts per status
  const statusCounts: Record<string, number> = { all: orders.length }
  for (const order of orders) {
    statusCounts[order.order_status] = (statusCounts[order.order_status] ?? 0) + 1
  }

  // Client-side search across offer code, FB name, customer (name/code/email/phone), and order code
  const offerSearchQuery = mainTab === 'offers' ? search.trim().toLowerCase() : ''
  const searchedOffers = offerSearchQuery
    ? offers.filter((o) => {
        const c = o.customers
        const haystack = [
          o.offer_code,
          o.fb_name,
          c?.customer_code,
          c?.first_name,
          c?.last_name,
          c ? formatCustomerName(c) : null,
          c?.email,
          c?.phone,
          o.orders?.order_code,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(offerSearchQuery)
      })
    : offers

  // Compute offer counts per status (reflects current search)
  const offerStatusCounts: Record<string, number> = { all: searchedOffers.length }
  for (const offer of searchedOffers) {
    offerStatusCounts[offer.offer_status] = (offerStatusCounts[offer.offer_status] ?? 0) + 1
  }

  // Delivery issue count
  const deliveryIssueCount = orders.filter((o) => o.delivery_issue_flag && o.order_status === 'SHIPPED').length

  // Filter by active tab
  let filteredOrders = statusTab === 'all'
    ? orders
    : orders.filter((o) => o.order_status === statusTab)

  if (showDeliveryIssuesOnly) {
    filteredOrders = filteredOrders.filter((o) => o.delivery_issue_flag)
  }

  const filteredOffers = statusTab === 'all'
    ? searchedOffers
    : searchedOffers.filter((o) => o.offer_status === statusTab)

  // Offers table columns
  const offerColumns: ColumnDef<OfferRow>[] = [
    {
      accessorKey: 'offer_code',
      header: 'Offer',
      cell: ({ row }) => <CodeDisplay code={row.original.offer_code} />,
    },
    {
      id: 'details',
      header: 'Details',
      cell: ({ row }) => {
        const c = row.original.customers
        const ord = row.original.orders
        const fullName = c ? formatCustomerName(c) : null
        const contactParts = [c?.email, c?.phone].filter(Boolean) as string[]
        return (
          <div onClick={(e) => e.stopPropagation()} className="text-xs leading-snug space-y-0.5 min-w-[240px]">
            <div>
              <span className="text-muted-foreground">FB Name: </span>
              <span className="font-medium">{row.original.fb_name}</span>
            </div>
            {c && (
              <>
                <div>
                  <span className="text-muted-foreground">Customer ID: </span>
                  <span className="font-mono">{c.customer_code}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Name: </span>
                  <Link
                    to={`/admin/customers/${c.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {fullName}
                  </Link>
                </div>
                {contactParts.length > 0 && (
                  <div className="whitespace-normal break-words">
                    <span className="text-muted-foreground">Contact: </span>
                    <span>{contactParts.join(' / ')}</span>
                  </div>
                )}
                {ord && (
                  <div>
                    <span className="text-muted-foreground">Order: </span>
                    <Link to={`/admin/orders/${ord.id}`} className="font-mono text-primary hover:underline">
                      {ord.order_code}
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        )
      },
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
            {statusTab === 'CONFIRMED' && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={invoiceCount === 0} onClick={handleBatchInvoice}>
                  <Printer className="h-4 w-4 mr-1" />
                  Print Invoices ({invoiceCount})
                </Button>
                <Button variant="outline" size="sm" disabled={dempyoCount === 0} onClick={handleBatchDempyo}>
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                  Print Dempyo ({dempyoCount})
                </Button>
              </div>
            )}
            {(statusTab === 'PACKED' || statusTab === 'SHIPPED') && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setTrackingImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-1" />
                  Import Tracking
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={refreshYamato.isPending}
                  onClick={() => {
                    refreshYamato.mutate(undefined, {
                      onSuccess: (result) => {
                        if (result.total === 0) {
                          toast.info('No shipped orders with tracking numbers to refresh')
                        } else {
                          toast.success(`Refreshed ${result.updated}/${result.total} orders${result.errors > 0 ? ` (${result.errors} errors)` : ''}`)
                        }
                      },
                      onError: (err) => {
                        toast.error(`Failed to refresh Yamato statuses: ${err.message}`)
                      },
                    })
                  }}
                >
                  <RefreshCw className={cn('h-4 w-4 mr-1', refreshYamato.isPending && 'animate-spin')} />
                  {refreshYamato.isPending ? 'Refreshing...' : 'Refresh Yamato'}
                </Button>
                {statusTab === 'SHIPPED' && deliveryIssueCount > 0 && (
                  <Button
                    variant={showDeliveryIssuesOnly ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setShowDeliveryIssuesOnly(!showDeliveryIssuesOnly)}
                    className={showDeliveryIssuesOnly ? '' : 'border-orange-300 text-orange-700 hover:bg-orange-50'}
                  >
                    <AlertTriangle className="h-4 w-4 mr-1" />
                    Delivery Issues ({deliveryIssueCount})
                  </Button>
                )}
              </div>
            )}
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
              placeholder="Search by offer code, FB name, customer, contact, or order code..."
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
      <YamatoTrackingImportDialog
        open={trackingImportOpen}
        onOpenChange={setTrackingImportOpen}
      />
    </div>
  )
}
