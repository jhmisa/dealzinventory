import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AuditLogCard } from './audit-log-card'
import { useItemAuditLogs } from '@/hooks/use-item-audit-logs'
import { SOURCE_TYPES, AC_ADAPTER_STATUSES } from '@/lib/constants'
import { formatDateTime } from '@/lib/utils'
import type { Item, Supplier } from '@/lib/types'

interface SourceAuditTabsProps {
  item: Item
  supplier: Pick<Supplier, 'supplier_name'> | null
  itemId: string
}

export function SourceAuditTabs({ item, supplier, itemId }: SourceAuditTabsProps) {
  const { data: logs } = useItemAuditLogs(itemId)

  const sourceLabel = SOURCE_TYPES.find((s) => s.value === item.source_type)?.label ?? item.source_type
  const acLabel = AC_ADAPTER_STATUSES.find((a) => a.value === item.ac_adapter_status)?.label ?? item.ac_adapter_status ?? '—'

  const logCount = logs?.length ?? 0

  return (
    <Card>
      <Tabs defaultValue="source">
        <CardHeader className="pb-3">
          <TabsList>
            <TabsTrigger value="source">Source & History</TabsTrigger>
            <TabsTrigger value="changes">
              Change History
              {logCount > 0 && (
                <span className="ml-1.5 rounded-full bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-semibold leading-none">
                  {logCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </CardHeader>
        <CardContent>
          <TabsContent value="source" className="mt-0">
            <div className="space-y-2 text-sm">
              <Row label="Source" value={sourceLabel} />
              <Row label="Supplier" value={supplier?.supplier_name} />
              <Row label="AC Adapter" value={acLabel} />
              <Row label="Created" value={formatDateTime(item.created_at)} />
              {item.inspected_at && <Row label="Inspected" value={formatDateTime(item.inspected_at)} />}
            </div>
          </TabsContent>
          <TabsContent value="changes" className="mt-0">
            <AuditLogCard itemId={itemId} />
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value || '—'}</span>
    </div>
  )
}
