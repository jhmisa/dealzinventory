import { Banknote, CreditCard, Landmark, Store, Wallet, type LucideIcon } from 'lucide-react'
import { SHOP_PAYMENT_METHODS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { SelectableCard } from '../selectable-card'
import { StickyCta } from '../sticky-cta'
import { CheckoutStepLayout } from '../step-layout'
import type { CheckoutData } from '../types'

interface PaymentStepProps {
  data: CheckoutData
  setData: (patch: Partial<CheckoutData>) => void
  onContinue: () => void
}

const PAYMENT_ICONS: Record<string, LucideIcon> = {
  COD: Banknote,
  KONBINI: Store,
  CREDIT_CARD: CreditCard,
  PAYPAL: Wallet,
  BANK: Landmark,
}

export function PaymentStep({ data, setData, onContinue }: PaymentStepProps) {
  return (
    <CheckoutStepLayout cta={<StickyCta label="Review order" onClick={onContinue} disabled={!data.paymentMethod} />}>
      <h1 className="mb-1 font-brand text-2xl font-extrabold tracking-tight text-brand-ink">How will you pay?</h1>
      <p className="mb-5 font-brand text-sm text-brand-umber">Pick a payment method — pay after we confirm.</p>

      <div className="space-y-3">
        {SHOP_PAYMENT_METHODS.map((m) => {
          const isFee = m.fee !== 'NO FEE'
          const Icon = PAYMENT_ICONS[m.code]
          return (
            <SelectableCard
              key={m.code}
              selected={data.paymentMethod === m.code}
              onSelect={() => setData({ paymentMethod: m.code })}
              showSelectedLabel={false}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-3">
                  {Icon && (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-ash/10 text-brand-ink">
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block font-brand text-base font-semibold text-brand-ink">{m.label}</span>
                    <span className="block font-data text-xs uppercase tracking-wider text-brand-umber">{m.sublabel}</span>
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded-md px-2 py-1 font-data text-[10px] uppercase tracking-wider',
                    isFee ? 'bg-brand-signal/10 text-brand-signal' : 'bg-[#E6EDE6] text-[#3F6B4A]',
                  )}
                >
                  {m.fee}
                </span>
              </span>
            </SelectableCard>
          )
        })}
      </div>
      <p className="mt-3 font-brand text-xs text-brand-ash">
        Card &amp; PayPal fees are confirmed by our team before you pay — not charged here.
      </p>
    </CheckoutStepLayout>
  )
}
