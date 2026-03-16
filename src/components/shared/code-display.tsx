import { memo } from 'react'
import { cn } from '@/lib/utils'

interface CodeDisplayProps {
  code: string
  className?: string
}

export const CodeDisplay = memo(function CodeDisplay({ code, className }: CodeDisplayProps) {
  return (
    <code className={cn('font-mono text-sm bg-muted px-1.5 py-0.5 rounded', className)}>
      {code}
    </code>
  )
})
