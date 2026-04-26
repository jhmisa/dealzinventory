import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { useActiveAlerts } from '@/hooks/use-messaging'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function SyncAlertIndicator() {
  const { data: alerts } = useActiveAlerts()

  if (!alerts || alerts.length === 0) return null

  const syncAlerts = alerts.filter((a) =>
    ['webhook_silent', 'webhook_errors', 'message_gap', 'sync_stale'].includes(a.alert_type),
  )

  if (syncAlerts.length === 0) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/admin/settings/messaging"
          className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>{syncAlerts.length} sync {syncAlerts.length === 1 ? 'alert' : 'alerts'}</span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        <ul className="space-y-1">
          {syncAlerts.map((a) => (
            <li key={a.id} className="text-xs">{a.message}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}
