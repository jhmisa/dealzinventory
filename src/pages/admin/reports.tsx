import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader, PriceDisplay, TableSkeleton } from '@/components/shared'
import { ITEM_STATUSES, CONDITION_GRADES, SOURCE_TYPES, ORDER_STATUSES, KAITORI_STATUSES } from '@/lib/constants'
import { Package, ShoppingCart, HandCoins, Users, TrendingUp, AlertTriangle } from 'lucide-react'

const LABEL_MAP: Record<string, string> = {}
for (const arr of [ITEM_STATUSES, CONDITION_GRADES, SOURCE_TYPES, ORDER_STATUSES, KAITORI_STATUSES]) {
  for (const item of arr) {
    LABEL_MAP[item.value] = item.label
  }
}

function useReportStats() {
  return useQuery({
    queryKey: ['reports', 'stats'],
    queryFn: async () => {
      const [items, orders, kaitori, customers, sellGroups] = await Promise.all([
        supabase.from('items').select('item_status, condition_grade, source_type'),
        supabase.from('orders').select('order_status, total_price, quantity'),
        supabase.from('kaitori_requests').select('request_status, auto_quote_price, final_price'),
        supabase.from('customers').select('is_seller, id_verified'),
        supabase.from('sell_groups').select('is_active, base_price'),
      ])

      if (items.error) throw items.error
      if (orders.error) throw orders.error
      if (kaitori.error) throw kaitori.error
      if (customers.error) throw customers.error
      if (sellGroups.error) throw sellGroups.error

      // Item stats
      const itemsByStatus: Record<string, number> = {}
      const itemsByGrade: Record<string, number> = {}
      const itemsBySource: Record<string, number> = {}
      for (const item of items.data ?? []) {
        itemsByStatus[item.item_status] = (itemsByStatus[item.item_status] ?? 0) + 1
        if (item.condition_grade) {
          itemsByGrade[item.condition_grade] = (itemsByGrade[item.condition_grade] ?? 0) + 1
        }
        itemsBySource[item.source_type] = (itemsBySource[item.source_type] ?? 0) + 1
      }

      // Order stats
      const ordersByStatus: Record<string, number> = {}
      let totalRevenue = 0
      let totalUnitsSold = 0
      for (const order of orders.data ?? []) {
        ordersByStatus[order.order_status] = (ordersByStatus[order.order_status] ?? 0) + 1
        if (order.order_status === 'DELIVERED') {
          totalRevenue += order.total_price ?? 0
          totalUnitsSold += order.quantity ?? 0
        }
      }

      // Kaitori stats
      const kaitoriByStatus: Record<string, number> = {}
      let totalKaitoriPaid = 0
      for (const req of kaitori.data ?? []) {
        kaitoriByStatus[req.request_status] = (kaitoriByStatus[req.request_status] ?? 0) + 1
        if (req.request_status === 'PAID') {
          totalKaitoriPaid += req.final_price ?? req.auto_quote_price ?? 0
        }
      }

      // Customer stats
      let totalCustomers = customers.data?.length ?? 0
      let sellerCount = 0
      let verifiedCount = 0
      for (const c of customers.data ?? []) {
        if (c.is_seller) sellerCount++
        if (c.id_verified) verifiedCount++
      }

      // Sell group stats
      const activeGroups = (sellGroups.data ?? []).filter((sg) => sg.is_active).length

      return {
        items: { total: items.data?.length ?? 0, byStatus: itemsByStatus, byGrade: itemsByGrade, bySource: itemsBySource },
        orders: { total: orders.data?.length ?? 0, byStatus: ordersByStatus, totalRevenue, totalUnitsSold },
        kaitori: { total: kaitori.data?.length ?? 0, byStatus: kaitoriByStatus, totalPaid: totalKaitoriPaid },
        customers: { total: totalCustomers, sellers: sellerCount, verified: verifiedCount },
        sellGroups: { total: sellGroups.data?.length ?? 0, active: activeGroups },
      }
    },
  })
}

export default function ReportsPage() {
  const { data: stats, isLoading } = useReportStats()

  if (isLoading) return <TableSkeleton rows={6} cols={4} />

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" />

      {/* Top-level KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          icon={<Package className="h-5 w-5" />}
          label="Total Items"
          value={stats?.items.total ?? 0}
        />
        <KpiCard
          icon={<ShoppingCart className="h-5 w-5" />}
          label="Total Orders"
          value={stats?.orders.total ?? 0}
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Revenue (Delivered)"
          value={<PriceDisplay price={stats?.orders.totalRevenue ?? 0} />}
        />
        <KpiCard
          icon={<HandCoins className="h-5 w-5" />}
          label="Kaitori Paid"
          value={<PriceDisplay price={stats?.kaitori.totalPaid ?? 0} />}
        />
      </div>

      {/* Inventory Breakdown */}
      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Inventory by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownList data={stats?.items.byStatus ?? {}} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Inventory by Grade</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownList data={stats?.items.byGrade ?? {}} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Inventory by Source</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownList data={stats?.items.bySource ?? {}} />
          </CardContent>
        </Card>
      </div>

      {/* Orders & Kaitori */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Orders by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownList data={stats?.orders.byStatus ?? {}} />
            <div className="mt-4 pt-3 border-t flex justify-between text-sm">
              <span className="text-muted-foreground">Units Sold (Delivered)</span>
              <span className="font-medium">{stats?.orders.totalUnitsSold ?? 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Kaitori by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownList data={stats?.kaitori.byStatus ?? {}} />
            {(stats?.kaitori.byStatus['QUOTED'] ?? 0) > 0 && (
              <div className="mt-3 flex items-center gap-2 text-amber-600 text-sm">
                <AlertTriangle className="h-4 w-4" />
                {stats?.kaitori.byStatus['QUOTED']} pending quotes
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Customer Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Customers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted">
              <p className="text-2xl font-bold">{stats?.customers.total ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted">
              <p className="text-2xl font-bold">{stats?.customers.sellers ?? 0}</p>
              <p className="text-xs text-muted-foreground">Sellers</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted">
              <p className="text-2xl font-bold">{stats?.customers.verified ?? 0}</p>
              <p className="text-xs text-muted-foreground">ID Verified</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sell Groups */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Sell Groups</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted">
              <p className="text-2xl font-bold">{stats?.sellGroups.total ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total Groups</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted">
              <p className="text-2xl font-bold">{stats?.sellGroups.active ?? 0}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs">{label}</span>
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  )
}

function BreakdownList({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1])
  const total = entries.reduce((sum, [, count]) => sum + count, 0)

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No data</p>
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, count]) => (
        <div key={key} className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 flex-1">
            <span>{LABEL_MAP[key] ?? key}</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary/60 rounded-full"
                style={{ width: `${total > 0 ? (count / total) * 100 : 0}%` }}
              />
            </div>
          </div>
          <span className="font-mono ml-2 tabular-nums">{count}</span>
        </div>
      ))}
    </div>
  )
}
