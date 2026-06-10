import type { ReactNode } from 'react'
import { Minus, Plus } from 'lucide-react'
import { formatPrice } from '@/lib/utils'
import type { SellGroupView } from './use-sell-group-view'

interface ProductSummaryProps {
  view: SellGroupView
  /** Optional trailing action in the title row (e.g. the photo sheet close button). */
  headerAction?: ReactNode
  /** When both are provided, a compact "Qty − n +" stepper renders inline beside the price. */
  quantity?: number
  onQuantityChange?: (q: number) => void
}

/**
 * Shared product header: title, item-code chip, grade + warranty chips, price
 * (with strikethrough when discounted) and an inline quantity stepper, plus the
 * FULL description (never truncated — customers must see every noted defect
 * before buying). Rendered identically on the Item landing and the PhotoSheet.
 */
export function ProductSummary({ view, headerAction, quantity, onQuantityChange }: ProductSummaryProps) {
  const showQty = quantity != null && onQuantityChange != null
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
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="font-data text-2xl font-bold text-brand-ink">{formatPrice(view.effectiveUnitPrice)}</span>
          {view.discountAmount > 0 && (
            <span className="font-data text-sm text-brand-ash line-through">{formatPrice(view.unitPrice)}</span>
          )}
          <span className="font-brand text-sm text-brand-ash">tax incl.</span>
        </div>
        {showQty && (
          <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-white py-1 pl-3 pr-1 shadow-sm">
            <span className="mr-0.5 font-data text-[11px] uppercase tracking-wider text-brand-umber">Qty</span>
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-ash/15"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-5 text-center font-data text-sm font-bold">{quantity}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => onQuantityChange(Math.min(view.stockCount || 1, quantity + 1))}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-ash/15"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      {view.shortDescription && (
        <p className="font-brand text-xs leading-snug text-brand-umber">{view.shortDescription}</p>
      )}
    </div>
  )
}
