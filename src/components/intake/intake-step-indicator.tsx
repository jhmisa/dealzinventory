import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export type IntakeStep = 'upload' | 'verify' | 'review-specs' | 'confirm' | 'success'

const STEPS: { key: IntakeStep; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'verify', label: 'Verify' },
  { key: 'review-specs', label: 'Review Specs' },
  { key: 'confirm', label: 'Confirm' },
  { key: 'success', label: 'Done' },
]

interface IntakeStepIndicatorProps {
  currentStep: IntakeStep
}

export function IntakeStepIndicator({ currentStep }: IntakeStepIndicatorProps) {
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep)

  return (
    <div className="flex items-center gap-2">
      {STEPS.map((step, idx) => {
        const isCompleted = idx < currentIdx
        const isCurrent = idx === currentIdx

        return (
          <div key={step.key} className="flex items-center gap-2">
            {idx > 0 && (
              <div className={cn(
                'h-px w-8',
                isCompleted ? 'bg-primary' : 'bg-muted-foreground/25',
              )} />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  'h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium',
                  isCompleted && 'bg-primary text-primary-foreground',
                  isCurrent && 'bg-primary text-primary-foreground',
                  !isCompleted && !isCurrent && 'bg-muted text-muted-foreground',
                )}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : idx + 1}
              </div>
              <span className={cn(
                'text-sm',
                isCurrent ? 'font-medium' : 'text-muted-foreground',
              )}>
                {step.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
