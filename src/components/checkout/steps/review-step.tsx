import { CreditCard, MapPin, Truck } from 'lucide-react'
import { serializeAddress } from '@/lib/address-types'
import { SHOP_PAYMENT_METHODS, YAMATO_TIME_SLOTS } from '@/lib/constants'
import { formatPrice } from '@/lib/utils'
import { StickyCta } from '../sticky-cta'
import type { CheckoutData, CheckoutStep } from '../types'
import type { SellGroupView } from '../use-sell-group-view'

interface ReviewStepProps {
  view: SellGroupView
  data: CheckoutData
  addressLabel: string
  onEdit: (step: CheckoutStep) => void
  onConfirm: () => void
  placing: boolean
}

function SummaryRow({
  icon,
  label,
  value,
  onEdit,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  onEdit: () => void
}) {
  return (
    <div className="flex items-start gap-3 border-b border-brand-ash/20 px-4 py-3 last:border-b-0">
      <span className="mt-0.5 text-brand-ash">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-data text-[10px] uppercase tracking-wider text-brand-ash">{label}</p>
        <div className="font-brand text-sm leading-snug text-brand-ink">{value}</div>
      </div>
      <button type="button" onClick={onEdit} className="font-brand text-sm font-semibold text-brand-ink underline-offset-2 hover:underline">
        Edit
      </button>
    </div>
  )
}

export function ReviewStep({ view, data, addressLabel, onEdit, onConfirm, placing }: ReviewStepProps) {
  const total = view.effectiveUnitPrice * data.quantity
  const slot = YAMATO_TIME_SLOTS.find((s) => s.code === data.deliveryTimeCode)
  const payment = SHOP_PAYMENT_METHODS.find((m) => m.code === data.paymentMethod)
  const addrEn = data.shippingAddress ? serializeAddress(data.shippingAddress, 'en') : ''

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="mb-1 font-brand text-2xl font-extrabold tracking-tight text-brand-ink">Quick check before you order</h1>
      <p className="mb-4 font-brand text-sm text-brand-umber">Tap any line to edit.</p>

      <div className="rounded-2xl bg-white shadow-sm">
        <SummaryRow
          icon={<MapPin className="h-4 w-4" />}
          label={`Ship to · ${addressLabel}`}
          value={<span className="whitespace-pre-line">{addrEn}</span>}
          onEdit={() => onEdit('address')}
        />
        <SummaryRow
          icon={<Truck className="h-4 w-4" />}
          label="Delivery"
          value={`${data.deliveryDate ?? '—'}${slot ? ` · ${slot.label_en}` : ''}`}
          onEdit={() => onEdit('schedule')}
        />
        <SummaryRow
          icon={<CreditCard className="h-4 w-4" />}
          label="Payment"
          value={payment ? `${payment.label} · ${payment.sublabel}` : '—'}
          onEdit={() => onEdit('payment')}
        />
      </div>

      <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between font-brand text-sm text-brand-umber">
          <span>{`Item · ${view.name} × ${data.quantity}`}</span>
          <span className="font-data">{formatPrice(total)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-brand-ash/20 pt-3">
          <span className="font-brand text-base font-bold text-brand-ink">Total</span>
          <span className="font-data text-xl font-bold text-brand-ink">{formatPrice(total)}</span>
        </div>
      </div>

      <StickyCta label={`Confirm order · ${formatPrice(total)}`} onClick={onConfirm} loading={placing} />
    </div>
  )
}
