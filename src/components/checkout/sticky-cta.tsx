import { ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StickyCtaProps {
  label: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  showArrow?: boolean
  /** Optional secondary action rendered as a plain text button below the CTA. */
  secondary?: { label: string; onClick: () => void }
}

export function StickyCta({
  label,
  onClick,
  disabled = false,
  loading = false,
  showArrow = true,
  secondary,
}: StickyCtaProps) {
  return (
    <div className="-mx-5 shrink-0 border-t border-brand-ash/15 bg-brand-paper px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || loading}
        className={cn(
          'flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl font-brand text-base font-semibold transition',
          disabled
            ? 'cursor-not-allowed bg-brand-ash text-white/90'
            : 'bg-brand-ink text-brand-paper hover:opacity-95',
        )}
      >
        {loading ? 'Please wait…' : label}
        {!loading && showArrow && !disabled && <ArrowRight className="h-4 w-4" />}
      </button>
      {secondary && (
        <button
          type="button"
          onClick={secondary.onClick}
          className="mt-2 h-11 w-full font-brand text-sm font-medium text-brand-umber hover:text-brand-ink"
        >
          {secondary.label}
        </button>
      )}
    </div>
  )
}
