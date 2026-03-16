import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  label: string
  color: string
  className?: string
}

export const StatusBadge = memo(function StatusBadge({ label, color, className }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn('font-medium', color, className)}>
      {label}
    </Badge>
  )
})
