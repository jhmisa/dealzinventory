import { cn } from '@/lib/utils'

interface StepProgressProps {
  /** 1-based current step number (1..total). */
  current: number
  total: number
  /** UPPERCASE step name, e.g. "SHIPPING". */
  label: string
}

export function StepProgress({ current, total, label }: StepProgressProps) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {Array.from({ length: total }).map((_, i) => {
          const index = i + 1
          const filled = index < current
          const isCurrent = index === current
          return (
            <div
              key={index}
              className={cn(
                'h-1 flex-1 rounded-full',
                filled && 'bg-brand-ink',
                isCurrent && 'bg-brand-ink',
                !filled && !isCurrent && 'bg-brand-ash/35',
              )}
            />
          )
        })}
      </div>
      <p className="font-data text-[11px] uppercase tracking-[0.12em] text-brand-umber">
        <span className="text-brand-signal">●</span> Step {current} of {total} · {label}
      </p>
    </div>
  )
}
