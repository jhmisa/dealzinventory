import { formatDistanceToNow } from 'date-fns'
import type { AiOpsActivity } from '@/lib/types'

interface ActivityFeedProps {
  items: AiOpsActivity[]
}

export function ActivityFeed({ items }: ActivityFeedProps) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No agent activity yet.</p>
  }
  return (
    <div className="divide-y rounded-md border">
      {items.map((a) => (
        <div key={a.id} className="flex items-start gap-3 p-3 text-sm">
          <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{a.tool}</code>
          <span className="min-w-0 flex-1 break-words text-muted-foreground">
            {a.result_summary ?? '—'}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
          </span>
        </div>
      ))}
    </div>
  )
}
