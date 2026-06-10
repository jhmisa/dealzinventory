import { Apple, Play } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * App Store / Google Play badges. The Dealz experience is web-only for now,
 * so these are non-interactive "Coming soon" placeholders — kept visually
 * present per the brand mockup, without dead links.
 */
export function StoreBadges({
  className,
  size = 'md',
}: {
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <StoreBadge icon={Apple} top="Coming soon" bottom="App Store" size={size} />
      <StoreBadge icon={Play} top="Coming soon" bottom="Google Play" size={size} />
    </div>
  )
}

function StoreBadge({
  icon: Icon,
  top,
  bottom,
  size,
}: {
  icon: typeof Apple
  top: string
  bottom: string
  size: 'sm' | 'md'
}) {
  return (
    <div
      role="img"
      aria-label={`${bottom} — coming soon`}
      className={cn(
        'inline-flex cursor-default select-none items-center gap-2.5 rounded-xl bg-brand-ink text-brand-paper',
        size === 'md' ? 'px-4 py-2.5' : 'px-3 py-2',
      )}
    >
      <Icon className={cn(size === 'md' ? 'h-6 w-6' : 'h-5 w-5')} strokeWidth={1.75} />
      <span className="flex flex-col leading-none">
        <span className="font-data text-[9px] uppercase tracking-[0.14em] text-brand-paper/45">
          {top}
        </span>
        <span
          className={cn(
            'font-brand font-semibold tracking-[-0.01em]',
            size === 'md' ? 'text-sm mt-0.5' : 'text-xs mt-0.5',
          )}
        >
          {bottom}
        </span>
      </span>
    </div>
  )
}
