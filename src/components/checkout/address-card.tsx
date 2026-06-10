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
  // Collapse the multi-line serialized address into compact inline strings so the card
  // stays short — this keeps the Receiver choice + Continue CTA visible above the fold.
  // EN parts read naturally comma-separated; JA uses spaces (Japanese addresses omit commas).
  const addr = address.address as unknown as ShippingAddress
  const en = serializeAddress(addr, 'en').replace(/\n/g, ', ')
  const ja = serializeAddress(addr, 'ja').replace(/\n/g, ' ')
  return (
    <SelectableCard selected={selected} onSelect={onSelect}>
      <span className="mb-1 flex items-center gap-2">
        <span className="font-brand text-base font-bold text-brand-ink">{displayLabel}</span>
        {selected && (
          <span className="font-data text-[10px] uppercase tracking-wider text-brand-signal">Selected</span>
        )}
      </span>
      <span className="line-clamp-2 block font-brand text-sm leading-snug text-brand-umber">{en}</span>
      <span className="mt-0.5 block truncate font-data text-xs leading-snug text-brand-ash">{ja}</span>
    </SelectableCard>
  )
}
