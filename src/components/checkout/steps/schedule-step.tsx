import { useEffect, useMemo } from 'react'
import { Calendar } from 'lucide-react'
import { YAMATO_TIME_SLOTS } from '@/lib/constants'
import { getEarliestDeliveryDate } from '@/lib/delivery-date'
import { SelectableCard } from '../selectable-card'
import { StickyCta } from '../sticky-cta'
import { CheckoutStepLayout } from '../step-layout'
import type { CheckoutData } from '../types'

interface ScheduleStepProps {
  data: CheckoutData
  setData: (patch: Partial<CheckoutData>) => void
  onContinue: () => void
}

export function ScheduleStep({ data, setData, onContinue }: ScheduleStepProps) {
  // Earliest selectable date respects the 4PM JST cutoff + Mon–Fri processing
  // (same helper the admin order flow uses). Today is NOT selectable after cutoff.
  const minDate = useMemo(() => getEarliestDeliveryDate(), [])

  // Preselect the earliest valid date (and clamp anything earlier), so the date is
  // never empty and never an already-passed slot.
  useEffect(() => {
    if (!data.deliveryDate || data.deliveryDate < minDate) {
      setData({ deliveryDate: minDate })
    }
  }, [minDate, data.deliveryDate, setData])

  const dateValue = data.deliveryDate && data.deliveryDate >= minDate ? data.deliveryDate : minDate

  return (
    <CheckoutStepLayout cta={<StickyCta label="Continue to payment" onClick={onContinue} disabled={!data.deliveryDate || !data.deliveryTimeCode} />}>
      <h1 className="mb-1 font-brand text-2xl font-extrabold tracking-tight text-brand-ink">When do you want it?</h1>
      <p className="mb-5 font-brand text-sm text-brand-umber">Choose a delivery date, then a time.</p>

      <p className="mb-2 font-data text-[11px] uppercase tracking-[0.12em] text-brand-umber">Delivery date</p>
      <label className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
        <Calendar className="h-5 w-5 text-brand-ash" />
        <input
          type="date"
          min={minDate}
          value={dateValue}
          onChange={(e) => {
            const val = e.target.value
            setData({ deliveryDate: val && val >= minDate ? val : minDate })
          }}
          className="flex-1 bg-transparent font-brand text-base font-semibold text-brand-ink outline-none"
        />
      </label>
      <p className="mt-2 font-brand text-xs text-brand-ash">Orders after 4PM JST or on weekends ship the next business day.</p>

      <p className="mb-2 mt-6 font-data text-[11px] uppercase tracking-[0.12em] text-brand-umber">Delivery time</p>
      <div className="grid grid-cols-2 gap-3">
        {YAMATO_TIME_SLOTS.map((slot) => (
          <SelectableCard
            key={slot.code}
            selected={data.deliveryTimeCode === slot.code}
            onSelect={() => setData({ deliveryTimeCode: slot.code })}
            showSelectedLabel={false}
          >
            <span className="font-brand text-sm font-semibold text-brand-ink">{slot.label_en}</span>
          </SelectableCard>
        ))}
      </div>
    </CheckoutStepLayout>
  )
}
