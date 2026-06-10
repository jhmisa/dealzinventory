import { Copy, Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { MediaGallery } from '../media-gallery'
import { StickyCta } from '../sticky-cta'
import { CheckoutStepLayout } from '../step-layout'
import type { SellGroupView } from '../use-sell-group-view'
import { formatPrice } from '@/lib/utils'

interface ItemStepProps {
  view: SellGroupView
  quantity: number
  onQuantityChange: (q: number) => void
  onProceed: () => void
}

export function ItemStep({ view, quantity, onQuantityChange, onProceed }: ItemStepProps) {
  const total = view.effectiveUnitPrice * quantity
  return (
    <CheckoutStepLayout cta={<StickyCta label={`Proceed to order · ${formatPrice(total)}`} onClick={onProceed} disabled={view.stockCount === 0} />}>
      <h1 className="mb-1.5 font-brand text-xl font-extrabold tracking-tight text-brand-ink">{view.name}</h1>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(view.primaryItemCode)
            toast.success('Code copied')
          }}
          className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 font-data text-sm font-bold text-brand-ink shadow-sm"
        >
          {view.primaryItemCode} <Copy className="h-3.5 w-3.5 text-brand-ash" />
        </button>
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
        <p className="mb-3 line-clamp-2 font-brand text-xs leading-snug text-brand-umber">{view.shortDescription}</p>
      )}

      <MediaGallery media={view.media} variant="full" />

      <div className="mt-3 flex items-center justify-between rounded-2xl bg-white p-2.5 shadow-sm">
        <span className="font-brand text-sm font-semibold text-brand-ink">Quantity</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-ash/15"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-6 text-center font-data text-base font-bold">{quantity}</span>
          <button
            type="button"
            onClick={() => onQuantityChange(Math.min(view.stockCount || 1, quantity + 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-ash/15"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {view.stockCount === 0 ? (
        <p className="mt-4 text-center font-brand text-sm text-brand-signal">Out of stock — cannot be ordered.</p>
      ) : null}
    </CheckoutStepLayout>
  )
}
