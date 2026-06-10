import { Check } from 'lucide-react'

interface ConfirmedStepProps {
  orderCode: string
  firstName: string | null
  onTrack: () => void
  onBackToShop: () => void
}

export function ConfirmedStep({ orderCode, firstName, onTrack, onBackToShop }: ConfirmedStepProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="relative mb-6">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-ink">
          <Check className="h-11 w-11 text-brand-paper" />
        </div>
        <span className="absolute right-1 top-1 h-3 w-3 rounded-full bg-brand-signal" />
      </div>
      <h1 className="mb-3 font-brand text-3xl font-extrabold tracking-tight text-brand-ink">Order confirmed</h1>
      <span className="mb-5 rounded-lg bg-white px-3 py-1.5 font-data text-base font-bold text-brand-ink shadow-sm">
        {orderCode}
      </span>
      <p className="max-w-[280px] font-brand text-sm leading-relaxed text-brand-umber">
        Thanks{firstName ? `, ${firstName}` : ''}. We've got your order and we'll message you on Messenger to arrange
        payment and delivery.
      </p>

      <div className="mt-auto w-full space-y-3 pb-[max(16px,env(safe-area-inset-bottom))] pt-8">
        <button
          type="button"
          onClick={onTrack}
          className="h-[52px] w-full rounded-2xl bg-brand-ink font-brand text-base font-semibold text-brand-paper"
        >
          Track your order
        </button>
        <button
          type="button"
          onClick={onBackToShop}
          className="h-[52px] w-full rounded-2xl bg-white font-brand text-base font-semibold text-brand-ink shadow-sm"
        >
          Back to shop
        </button>
      </div>
    </div>
  )
}
