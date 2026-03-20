import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface StatusConfig {
  value: string
  label: string
  color: string
}

interface StatusBadgeProps {
  status: string
  config: readonly StatusConfig[] | StatusConfig[]
  className?: string
}

export const StatusBadge = memo(function StatusBadge({ status, config, className }: StatusBadgeProps) {
  const match = config.find(c => c.value === status)
  const label = match?.label ?? status
  const color = match?.color ?? 'bg-gray-100 text-gray-800 border-gray-300'

  return (
    <Badge variant="outline" className={cn('font-medium', color, className)}>
      {label}
    </Badge>
  )
})
