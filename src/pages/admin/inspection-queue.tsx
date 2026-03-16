import { useNavigate } from 'react-router-dom'
import { ClipboardEdit } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader, CodeDisplay, TableSkeleton } from '@/components/shared'
import { useIntakeItems } from '@/hooks/use-items'
import { formatDateTime } from '@/lib/utils'

export default function InspectionQueuePage() {
  const navigate = useNavigate()
  const { data: items, isLoading } = useIntakeItems()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inspection Queue"
        description={`${items?.length ?? 0} items waiting for inspection`}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-3xl font-bold">{items?.length ?? 0}</p>
            <p className="text-sm text-muted-foreground">Waiting</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} columns={5} />
      ) : !items || items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No items waiting for inspection. All caught up!
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Items Awaiting Inspection</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="grid grid-cols-5 gap-4 px-3 py-2 text-xs font-medium text-muted-foreground uppercase">
                <span>P-Code</span>
                <span>Model</span>
                <span>Supplier</span>
                <span>Created</span>
                <span className="text-right">Action</span>
              </div>
              {items.map((item) => {
                const pm = item.product_models as { brand: string; model_name: string } | null
                const supplier = (item.suppliers as { supplier_name: string } | null)?.supplier_name

                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-5 gap-4 items-center px-3 py-3 border-b last:border-0 hover:bg-muted/50 rounded cursor-pointer"
                    onClick={() => navigate(`/admin/inspection/${item.id}`)}
                  >
                    <CodeDisplay code={item.item_code} />
                    <span className="text-sm truncate">
                      {pm ? `${pm.brand} ${pm.model_name}` : '—'}
                    </span>
                    <span className="text-sm truncate text-muted-foreground">
                      {supplier ?? '—'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(item.created_at)}
                    </span>
                    <div className="text-right">
                      <Button size="sm" variant="outline">
                        <ClipboardEdit className="h-3 w-3 mr-1" />
                        Inspect
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
