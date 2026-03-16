import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useItemAuditLogs } from '@/hooks/use-item-audit-logs'
import { AUDIT_FIELD_LABELS } from '@/lib/constants'
import { formatDateTime } from '@/lib/utils'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface AuditLogCardProps {
  itemId: string
}

const COLLAPSED_LIMIT = 10

export function AuditLogCard({ itemId }: AuditLogCardProps) {
  const { data: logs, isLoading } = useItemAuditLogs(itemId)
  const [expanded, setExpanded] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 bg-muted animate-pulse rounded" />
        ))}
      </div>
    )
  }

  if (!logs || logs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
    )
  }

  const visibleLogs = expanded ? logs : logs.slice(0, COLLAPSED_LIMIT)
  const hasMore = logs.length > COLLAPSED_LIMIT

  return (
    <div className="space-y-3">
      {visibleLogs.map((log) => {
        const fieldLabel = AUDIT_FIELD_LABELS[log.field_name] ?? log.field_name

        return (
          <div key={log.id} className="text-sm border-b border-border/50 pb-2 last:border-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{fieldLabel}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {log.changed_by_email && (
                  <span title={log.changed_by_email}>
                    {log.changed_by_email.split('@')[0]}
                    {' · '}
                  </span>
                )}
                {formatDateTime(log.created_at)}
              </span>
            </div>
            <div className="text-muted-foreground mt-0.5">
              <span className="text-red-600/70 line-through">{log.old_value ?? '(empty)'}</span>
              {' → '}
              <span className="text-green-700">{log.new_value ?? '(empty)'}</span>
            </div>
          </div>
        )
      })}

      {hasMore && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" />
              Show all {logs.length} changes
            </>
          )}
        </Button>
      )}
    </div>
  )
}
