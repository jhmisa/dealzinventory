import { Calendar } from 'lucide-react'
import { YAMATO_TIME_SLOTS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { StickyCta } from '../sticky-cta'
import { CheckoutStepLayout } from '../step-layout'
import type { CheckoutData } from '../types'

interface ScheduleStepProps {
  data: CheckoutData
  setData: (patch: Partial<CheckoutData>) => void
  onContinue: () => void
}

export function ScheduleStep({ data, setData, onContinue }: ScheduleStepProps) {
  const todayStr = new Date().toISOString().split('T')[0]
  return (
    <CheckoutStepLayout cta={<StickyCta label="Continue to payment" onClick={onContinue} disabled={!data.deliveryDate || !data.deliveryTimeCode} />}>
      <h1 className="mb-1 font-brand text-2xl font-extrabold tracking-tight text-brand-ink">When do you want it?</h1>
      <p className="mb-5 font-brand text-sm text-brand-umber">Choose a delivery date, then a time.</p>

      <p className="mb-2 font-data text-[11px] uppercase tracking-[0.12em] text-brand-umber">Delivery date</p>
      <label className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <Calendar className="h-5 w-5 text-brand-ash" />
        <input
          type="date"
          min={todayStr}
          value={data.deliveryDate ?? ''}
          onChange={(e) => setData({ deliveryDate: e.target.value || null })}
          className="flex-1 bg-transparent font-brand text-base font-semibold text-brand-ink outline-none"
        />
      </label>
      <p className="mt-2 font-brand text-xs text-brand-ash">Orders after 4PM JST ship the next business day.</p>

      <p className="mb-2 mt-6 font-data text-[11px] uppercase tracking-[0.12em] text-brand-umber">Delivery time</p>
      <div className="grid grid-cols-2 gap-3">
        {YAMATO_TIME_SLOTS.map((slot) => {
          const selected = data.deliveryTimeCode === slot.code
          return (
            <button
              key={slot.code}
              type="button"
              onClick={() => setData({ deliveryTimeCode: slot.code })}
              className={cn(
                'flex items-center gap-2 rounded-2xl border p-4 font-brand text-sm font-semibold transition',
                selected
                  ? 'border-[#EADFCB] bg-[#FAF4EA] text-brand-ink shadow-[0_8px_22px_rgba(22,20,15,0.09)]'
                  : 'border-brand-ash/40 bg-white text-brand-ink',
              )}
            >
              {selected && <span className="h-2 w-2 rounded-full bg-brand-signal" />}
              {slot.label_en}
            </button>
          )
        })}
      </div>
    </CheckoutStepLayout>
  )
}
