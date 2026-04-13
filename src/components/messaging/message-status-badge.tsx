import { memo } from 'react'
import { Check, Loader2, AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MessageStatus } from '@/lib/types'

const statusConfig: Record<MessageStatus, { icon: typeof Check; className: string; label: string }> = {
  SENT: { icon: Check, className: 'text-green-600', label: 'Sent' },
  SENDING: { icon: Loader2, className: 'text-muted-foreground animate-spin', label: 'Sending' },
  DRAFT: { icon: Check, className: 'text-muted-foreground', label: 'Draft' },
  FAILED: { icon: AlertCircle, className: 'text-destructive', label: 'Failed' },
  REJECTED: { icon: X, className: 'text-muted-foreground', label: 'Rejected' },
}

export const MessageStatusBadge = memo(function MessageStatusBadge({
  status,
  className,
}: {
  status: MessageStatus
  className?: string
}) {
  const config = statusConfig[status]
  const Icon = config.icon
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', config.className, className)} title={config.label}>
      <Icon className="h-3 w-3" />
    </span>
  )
})
