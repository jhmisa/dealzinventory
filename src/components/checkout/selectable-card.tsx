import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SelectableCardProps {
  selected: boolean
  onSelect: () => void
  /** Show the small red "SELECTED" label + check when selected (default true). */
  showSelectedLabel?: boolean
  className?: string
  children: React.ReactNode
}

export function SelectableCard({
  selected,
  onSelect,
  showSelectedLabel = true,
  className,
  children,
}: SelectableCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition',
        'min-h-[44px]',
        selected
          ? 'border-[#EADFCB] bg-[#FAF4EA] shadow-[0_8px_22px_rgba(22,20,15,0.09)]'
          : 'border-brand-ash/40 bg-white hover:border-brand-ash/70',
        className,
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-brand-signal' : 'border-brand-ash',
        )}
      >
        {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand-signal" />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
      {selected && showSelectedLabel && (
        <span className="ml-auto flex shrink-0 items-center gap-1 text-brand-signal">
          <Check className="h-4 w-4" />
        </span>
      )}
    </button>
  )
}
