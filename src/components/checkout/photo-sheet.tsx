import { X } from 'lucide-react'
import { MediaGallery } from './media-gallery'
import { ProductSummary } from './product-summary'
import type { SellGroupView } from './use-sell-group-view'

interface PhotoSheetProps {
  open: boolean
  onClose: () => void
  view: SellGroupView
  quantity: number
  onQuantityChange: (q: number) => void
  backLabel: string // e.g. "Back to shipping"
}

export function PhotoSheet({ open, onClose, view, quantity, onQuantityChange, backLabel }: PhotoSheetProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-[96dvh] flex-col rounded-t-3xl bg-brand-paper"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (pinned) — same product summary as the Item landing, incl. inline qty */}
        <div className="shrink-0 px-4 pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-brand-ash/40" />
          <ProductSummary
            view={view}
            quantity={quantity}
            onQuantityChange={onQuantityChange}
            headerAction={
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-ash/20"
              >
                <X className="h-4 w-4 text-brand-ink" />
              </button>
            }
          />
        </div>

        {/* Scrollable media */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-3">
          <MediaGallery media={view.media} variant="sheet" />
        </div>

        {/* Back button (pinned) */}
        <div className="shrink-0 border-t border-brand-ash/15 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={onClose}
            className="h-[52px] w-full rounded-2xl bg-brand-ink font-brand text-base font-semibold text-brand-paper"
          >
            {backLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
