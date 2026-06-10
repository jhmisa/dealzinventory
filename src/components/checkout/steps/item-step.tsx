import { MediaGallery } from '../media-gallery'
import { StickyCta } from '../sticky-cta'
import { CheckoutStepLayout } from '../step-layout'
import { ProductSummary } from '../product-summary'
import { QuantityStepper } from '../quantity-stepper'
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
      <ProductSummary view={view} descriptionLines={2} />

      <div className="mt-3">
        <MediaGallery media={view.media} variant="full" />
      </div>

      <div className="mt-3">
        <QuantityStepper quantity={quantity} max={view.stockCount} onChange={onQuantityChange} />
      </div>

      {view.stockCount === 0 ? (
        <p className="mt-4 text-center font-brand text-sm text-brand-signal">Out of stock — cannot be ordered.</p>
      ) : null}
    </CheckoutStepLayout>
  )
}
