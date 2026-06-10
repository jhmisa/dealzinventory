import { Minus, Plus } from 'lucide-react'

interface QuantityStepperProps {
  quantity: number
  /** Upper bound (stock count); falls back to 1 when stock is unknown/zero. */
  max: number
  onChange: (q: number) => void
}

/** White "Quantity − n +" card, shared by the Item landing step and the PhotoSheet drawer. */
export function QuantityStepper({ quantity, max, onChange }: QuantityStepperProps) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white p-2.5 shadow-sm">
      <span className="font-brand text-sm font-semibold text-brand-ink">Quantity</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, quantity - 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-ash/15"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-6 text-center font-data text-base font-bold">{quantity}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max || 1, quantity + 1))}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-ash/15"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
