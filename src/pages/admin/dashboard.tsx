import { useNavigate } from 'react-router-dom'
import { Package, CheckCircle, Wrench, AlertTriangle, Plus, ClipboardList, QrCode, Lock, ShoppingBag, Undo2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader, StatusBadge, GradeBadge, CodeDisplay, CardSkeleton } from '@/components/shared'
import { useDashboardStats } from '@/hooks/use-dashboard'
import { ITEM_STATUSES } from '@/lib/constants'
import { formatDateTime } from '@/lib/utils'

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  INTAKE: Package,
  AVAILABLE: CheckCircle,
  RESERVED: Lock,
  REPAIR: Wrench,
  MISSING: AlertTriangle,
  SOLD: ShoppingBag,
  SUPPLIER_RETURN: Undo2,
  REMOVED: Trash2,
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data: stats, isLoading } = useDashboardStats()

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)
        ) : (
          ITEM_STATUSES.map((s) => {
            const Icon = STATUS_ICONS[s.value as keyof typeof STATUS_ICONS]
            const count = stats?.statusCounts[s.value as keyof typeof stats.statusCounts] ?? 0
            return (
              <Card key={s.value} className="cursor-pointer hover:border-primary/50" onClick={() => navigate(`/admin/items?status=${s.value}`)}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{s.label}</p>
                      <p className="text-3xl font-bold">{count}</p>
                    </div>
                    <div className={`p-3 rounded-lg ${s.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:border-primary/50" onClick={() => navigate('/admin/items/intake')}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary/10">
              <Plus className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Start Intake</p>
              <p className="text-sm text-muted-foreground">Add new items from auction/wholesale</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50" onClick={() => navigate('/admin/inspection')}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-yellow-100">
              <ClipboardList className="h-5 w-5 text-yellow-700" />
            </div>
            <div>
              <p className="font-medium">Inspection Queue</p>
              <p className="text-sm text-muted-foreground">{stats?.intakeCount ?? 0} items waiting</p>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50" onClick={() => navigate('/admin/items/scan')}>
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-3 rounded-lg bg-blue-100">
              <QrCode className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <p className="font-medium">Scan QR Code</p>
              <p className="text-sm text-muted-foreground">Look up item by QR scan</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Inspections</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : stats?.recentInspections && stats.recentInspections.length > 0 ? (
            <div className="space-y-2">
              {stats.recentInspections.map((item) => {
                const statusCfg = ITEM_STATUSES.find((s) => s.value === item.item_status)
                const pm = item.product_models as { brand: string; model_name: string } | null
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2 border-b last:border-0 cursor-pointer hover:bg-muted/50 rounded px-2"
                    onClick={() => navigate(`/admin/items/${item.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <CodeDisplay code={item.item_code} />
                      <span className="text-sm">{pm ? `${pm.brand} ${pm.model_name}` : '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <GradeBadge grade={item.condition_grade} />
                      {statusCfg && <StatusBadge label={statusCfg.label} color={statusCfg.color} />}
                      <span className="text-xs text-muted-foreground">{formatDateTime(item.inspected_at)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No inspections yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
