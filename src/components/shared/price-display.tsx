import { memo } from 'react'
import { formatPrice, cn } from '@/lib/utils'

interface PriceDisplayProps {
  amount: number | null | undefined
  className?: string
}

export const PriceDisplay = memo(function PriceDisplay({ amount, className }: PriceDisplayProps) {
  return (
    <span className={cn('font-mono tabular-nums', className)}>
      {formatPrice(amount)}
    </span>
  )
})
