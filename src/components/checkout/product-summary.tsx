import type { ReactNode } from 'react'
import { cn, formatPrice } from '@/lib/utils'
import type { SellGroupView } from './use-sell-group-view'

interface ProductSummaryProps {
  view: SellGroupView
  /** Optional trailing action in the title row (e.g. the photo sheet close button). */
  headerAction?: ReactNode
  /** Clamp the description so the header stays compact (default 2 lines). */
  descriptionLines?: 2 | 3
}

/**
 * Shared product header: title, copyable item-code chip, grade + warranty chips,
 * price (with strikethrough when discounted), and a clamped description.
 * Rendered identically on the Item landing step and inside the PhotoSheet drawer.
 */
export function ProductSummary({ view, headerAction, descriptionLines = 2 }: ProductSummaryProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-start justify-between gap-3">
        <h1 className="font-brand text-xl font-extrabold tracking-tight text-brand-ink">{view.name}</h1>
        {headerAction}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-white px-2.5 py-1 font-data text-sm font-bold text-brand-ink shadow-sm">
          {view.primaryItemCode}
        </span>
        {view.grade && (
          <span className="rounded-lg bg-[#ECE7DC] px-2.5 py-1 font-data text-xs uppercase tracking-wider text-brand-umber">
            Grade {view.gradeLabel}
          </span>
        )}
        <span className="rounded-lg bg-[#ECE7DC] px-2.5 py-1 font-data text-xs uppercase tracking-wider text-brand-umber">
          30-Day Warranty
        </span>
      </div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="font-data text-2xl font-bold text-brand-ink">{formatPrice(view.effectiveUnitPrice)}</span>
        {view.discountAmount > 0 && (
          <span className="font-data text-sm text-brand-ash line-through">{formatPrice(view.unitPrice)}</span>
        )}
        <span className="font-brand text-sm text-brand-ash">tax incl.</span>
      </div>
      {view.shortDescription && (
        <p
          className={cn(
            'font-brand text-xs leading-snug text-brand-umber',
            descriptionLines === 3 ? 'line-clamp-3' : 'line-clamp-2',
          )}
        >
          {view.shortDescription}
        </p>
      )}
    </div>
  )
}
