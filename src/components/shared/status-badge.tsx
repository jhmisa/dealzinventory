import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface StatusConfig {
  value: string
  label: string
  color: string
}

type StatusBadgeProps = {
  className?: string
} & (
  | { status: string; config: readonly StatusConfig[] | StatusConfig[]; label?: never; color?: never }
  | { label: string; color: string; status?: never; config?: never }
)

export const StatusBadge = memo(function StatusBadge(props: StatusBadgeProps) {
  let label: string
  let color: string

  if ('config' in props && props.config) {
    const match = props.config.find(c => c.value === props.status)
    label = match?.label ?? props.status!
    color = match?.color ?? 'bg-gray-100 text-gray-800 border-gray-300'
  } else {
    label = props.label!
    color = props.color!
  }

  return (
    <Badge variant="outline" className={cn('font-medium', color, props.className)}>
      {label}
    </Badge>
  )
})
