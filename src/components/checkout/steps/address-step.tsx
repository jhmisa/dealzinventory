import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useCustomerAuth } from '@/hooks/use-customer-auth'
import { getCustomerAddresses, createCustomerAddress } from '@/services/customer-addresses'
import type { ShippingAddress } from '@/lib/address-types'
import { uppercaseAddress } from '@/lib/address-types'
import { AddressForm } from '@/components/shared'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/shared/phone-input'
import { AddressCard } from '../address-card'
import { SelectableCard } from '../selectable-card'
import { StickyCta } from '../sticky-cta'
import type { CheckoutData } from '../types'

interface AddressStepProps {
  data: CheckoutData
  setData: (patch: Partial<CheckoutData>) => void
  onContinue: () => void
}

export function AddressStep({ data, setData, onContinue }: AddressStepProps) {
  const { customer } = useCustomerAuth()
  const queryClient = useQueryClient()
  const customerId = customer?.id ?? ''

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['customer-addresses', customerId],
    queryFn: () => getCustomerAddresses(customerId),
    enabled: !!customerId,
  })

  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<ShippingAddress | null>(null)
  const [saving, setSaving] = useState(false)

  const canContinue = useMemo(() => {
    if (!data.selectedAddressId || !data.shippingAddress) return false
    if (data.receiverMode === 'other') {
      return !!(data.receiverFirstName.trim() && data.receiverLastName.trim() && data.receiverPhone.trim())
    }
    return true
  }, [data])

  const selectAddress = (id: string, addr: ShippingAddress) => {
    setData({ selectedAddressId: id, shippingAddress: addr })
  }

  const handleSave = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const saved = await createCustomerAddress({
        customer_id: customerId,
        // label is required by the generated Insert type but the service
        // auto-generates it from a count query; pass empty string as a
        // satisfying placeholder — the service overwrites it before INSERT.
        label: '',
        // address is a Json column; cast the structured ShippingAddress to
        // satisfy the generated type while keeping the real object at runtime.
        address: uppercaseAddress(draft) as never,
      })
      await queryClient.invalidateQueries({ queryKey: ['customer-addresses', customerId] })
      selectAddress(saved.id, saved.address as unknown as ShippingAddress)
      setAdding(false)
      setDraft(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save address')
    } finally {
      setSaving(false)
    }
  }

  if (adding) {
    return (
      <div className="flex flex-1 flex-col">
        <h1 className="mb-1 font-brand text-2xl font-extrabold tracking-tight text-brand-ink">Add a new address</h1>
        <p className="mb-4 font-brand text-sm text-brand-umber">Enter your postal code — we'll fill the rest.</p>
        <AddressForm value={draft} onChange={setDraft} required />
        <StickyCta
          label="Save address"
          showArrow={false}
          onClick={handleSave}
          disabled={!draft}
          loading={saving}
          secondary={{ label: 'Cancel', onClick: () => { setAdding(false); setDraft(null) } }}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="mb-1 font-brand text-2xl font-extrabold tracking-tight text-brand-ink">Where should we ship?</h1>
      <p className="mb-4 font-brand text-sm text-brand-umber">Tap an address to choose it.</p>

      {isLoading ? (
        <p className="font-brand text-sm text-brand-ash">Loading addresses…</p>
      ) : (
        <div className="space-y-3">
          {addresses.map((a, i) => (
            <AddressCard
              key={a.id}
              address={a}
              displayLabel={a.label ?? `Address ${i + 1}`}
              selected={data.selectedAddressId === a.id}
              onSelect={() => selectAddress(a.id, a.address as unknown as ShippingAddress)}
            />
          ))}
          {addresses.length === 0 && (
            <p className="font-brand text-sm text-brand-ash">No saved addresses yet — add one below.</p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setAdding(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-ash/60 py-3 font-brand text-sm font-semibold text-brand-ink"
      >
        <Plus className="h-4 w-4" /> Add new address
      </button>

      {/* Receiver */}
      <p className="mb-2 mt-6 font-data text-[11px] uppercase tracking-[0.12em] text-brand-umber">Receiver</p>
      <div className="grid grid-cols-2 gap-3">
        <SelectableCard
          selected={data.receiverMode === 'me'}
          onSelect={() => setData({ receiverMode: 'me' })}
          showSelectedLabel={false}
        >
          <span className="block font-brand text-sm font-semibold text-brand-ink">Me</span>
          <span className="block font-brand text-xs text-brand-umber">
            {[customer?.first_name, customer?.last_name].filter(Boolean).join(' ') || 'Account holder'}
          </span>
        </SelectableCard>
        <SelectableCard
          selected={data.receiverMode === 'other'}
          onSelect={() => setData({ receiverMode: 'other' })}
          showSelectedLabel={false}
        >
          <span className="block font-brand text-sm font-semibold text-brand-ink">Someone else</span>
        </SelectableCard>
      </div>

      {data.receiverMode === 'other' && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Input
            placeholder="First name"
            value={data.receiverFirstName}
            onChange={(e) => setData({ receiverFirstName: e.target.value })}
          />
          <Input
            placeholder="Last name"
            value={data.receiverLastName}
            onChange={(e) => setData({ receiverLastName: e.target.value })}
          />
          <div className="col-span-2">
            <PhoneInput value={data.receiverPhone} onChange={(v) => setData({ receiverPhone: v })} />
          </div>
        </div>
      )}

      <StickyCta label="Continue to schedule" onClick={onContinue} disabled={!canContinue} />
    </div>
  )
}
