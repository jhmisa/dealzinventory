import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getGradeConfig } from '@/lib/constants'
import type { ConditionGrade } from '@/lib/types'

interface GradeBadgeProps {
  grade: ConditionGrade | null | undefined
  className?: string
}

export const GradeBadge = memo(function GradeBadge({ grade, className }: GradeBadgeProps) {
  const config = getGradeConfig(grade)
  return (
    <Badge variant="outline" className={cn('font-bold', config.color, className)}>
      {grade ?? '—'}
    </Badge>
  )
})
