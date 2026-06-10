import type { CustomerAddress } from '@/lib/types'
import type { ShippingAddress } from '@/lib/address-types'
import { serializeAddress } from '@/lib/address-types'
import { SelectableCard } from './selectable-card'

interface AddressCardProps {
  address: CustomerAddress
  /** Display label, e.g. "Address 1" (computed by the caller from list order). */
  displayLabel: string
  selected: boolean
  onSelect: () => void
}

export function AddressCard({ address, displayLabel, selected, onSelect }: AddressCardProps) {
  // `address.address` is the structured ShippingAddress stored as JSON.
  const addr = address.address as unknown as ShippingAddress
  const en = serializeAddress(addr, 'en')
  const ja = serializeAddress(addr, 'ja')
  return (
    <SelectableCard selected={selected} onSelect={onSelect}>
      <span className="mb-1 flex items-center gap-2">
        <span className="font-brand text-base font-bold text-brand-ink">{displayLabel}</span>
        {selected && (
          <span className="font-data text-[10px] uppercase tracking-wider text-brand-signal">Selected</span>
        )}
      </span>
      <span className="block whitespace-pre-line font-brand text-sm leading-snug text-brand-umber">{en}</span>
      <span className="mt-1 block whitespace-pre-line font-data text-xs leading-snug text-brand-ash">{ja}</span>
    </SelectableCard>
  )
}
