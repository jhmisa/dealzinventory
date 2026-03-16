import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface ConfidenceBadgeProps {
  confidence: number | null | undefined
}

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  if (confidence == null) {
    return <Badge variant="outline" className="text-xs">Manual</Badge>
  }

  const pct = Math.round(confidence * 100)
  const color = confidence >= 0.9
    ? 'bg-green-100 text-green-800 border-green-300'
    : confidence >= 0.7
    ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
    : 'bg-red-100 text-red-800 border-red-300'

  return (
    <Badge variant="outline" className={cn('text-xs', color)}>
      {pct}%
    </Badge>
  )
}
