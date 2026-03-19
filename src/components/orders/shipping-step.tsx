import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { AddressForm } from '@/components/shared/address-form'
import { AddressDisplay } from '@/components/shared/address-display'
import { useCustomerAddresses, useCreateCustomerAddress } from '@/hooks/use-customer-addresses'
import { YAMATO_TIME_SLOTS } from '@/lib/constants'
import { Plus, Loader2 } from 'lucide-react'
import type { ShippingAddress } from '@/lib/address-types'
import type { Customer } from '@/lib/types'

interface ShippingStepProps {
  customer: Customer
  orderSource: string
  selectedAddress: { address: ShippingAddress; careOf?: string | null } | null
  onAddressSelect: (address: ShippingAddress, careOf?: string | null) => void
  deliveryDate: string | null
  onDeliveryDateChange: (date: string | null) => void
  deliveryTimeCode: string | null
  onDeliveryTimeCodeChange: (code: string | null) => void
}

export function ShippingStep({
  customer,
  orderSource,
  selectedAddress,
  onAddressSelect,
  deliveryDate,
  onDeliveryDateChange,
  deliveryTimeCode,
  onDeliveryTimeCodeChange,
}: ShippingStepProps) {
  const [showNewForm, setShowNewForm] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newCareOf, setNewCareOf] = useState('')
  const [newAddress, setNewAddress] = useState<ShippingAddress | null>(null)
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)

  const { data: savedAddresses, isLoading } = useCustomerAddresses(customer.id)
  const createAddress = useCreateCustomerAddress()

  const isWalkIn = orderSource === 'WALK_IN'

  // Build address list: saved addresses + legacy fallback
  const addressOptions: { id: string; label: string; careOf?: string | null; address: ShippingAddress }[] = []

  if (savedAddresses) {
    for (const addr of savedAddresses) {
      addressOptions.push({
        id: addr.id,
        label: addr.label,
        careOf: addr.care_of,
        address: addr.address as unknown as ShippingAddress,
      })
    }
  }

  // Legacy fallback
  if (addressOptions.length === 0 && customer.shipping_address) {
    let legacyAddr: ShippingAddress | null = null
    try {
      legacyAddr = typeof customer.shipping_address === 'string'
        ? JSON.parse(customer.shipping_address)
        : customer.shipping_address as unknown as ShippingAddress
    } catch {
      // skip unparseable
    }
    if (legacyAddr) {
      addressOptions.push({
        id: '__legacy__',
        label: 'Primary Address',
        careOf: null,
        address: legacyAddr,
      })
    }
  }

  // Tomorrow's date in YYYY-MM-DD format
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = tomorrow.toISOString().split('T')[0]

  const handleAddressSelect = (id: string) => {
    setSelectedAddressId(id)
    const option = addressOptions.find((a) => a.id === id)
    if (option) {
      onAddressSelect(option.address, option.careOf)
    }
  }

  const handleSaveNewAddress = async () => {
    if (!newAddress || !newLabel) return

    const saved = await createAddress.mutateAsync({
      customer_id: customer.id,
      label: newLabel,
      care_of: newCareOf || null,
      address: newAddress as unknown as Record<string, unknown>,
      is_default: addressOptions.length === 0,
    })

    onAddressSelect(newAddress, newCareOf || null)
    setSelectedAddressId(saved.id)
    setShowNewForm(false)
    setNewLabel('')
    setNewCareOf('')
    setNewAddress(null)
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Address Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shipping Address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {addressOptions.length > 0 && (
            <RadioGroup value={selectedAddressId ?? ''} onValueChange={handleAddressSelect}>
              {addressOptions.map((option) => (
                <div key={option.id} className="flex items-start gap-3 p-3 rounded-md border hover:bg-accent/50 transition-colors">
                  <RadioGroupItem value={option.id} id={option.id} className="mt-1" />
                  <label htmlFor={option.id} className="flex-1 cursor-pointer">
                    <p className="font-medium text-sm">{option.label}</p>
                    {option.careOf && (
                      <p className="text-sm text-muted-foreground">C/O {option.careOf}</p>
                    )}
                    <div className="mt-1 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Japanese</p>
                        <AddressDisplay address={option.address} format="jp" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">English</p>
                        <AddressDisplay address={option.address} format="en" />
                      </div>
                    </div>
                  </label>
                </div>
              ))}
            </RadioGroup>
          )}

          {!showNewForm ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowNewForm(true)}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add new address
            </Button>
          ) : (
            <div className="border rounded-md p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Label *</Label>
                  <Input
                    placeholder='e.g. "Home", "Office"'
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">C/O (Care of)</Label>
                  <Input
                    placeholder="Recipient name if different"
                    value={newCareOf}
                    onChange={(e) => setNewCareOf(e.target.value)}
                  />
                </div>
              </div>

              <AddressForm
                value={newAddress}
                onChange={setNewAddress}
              />

              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveNewAddress}
                  disabled={!newLabel || !newAddress || createAddress.isPending}
                >
                  {createAddress.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                  Save Address
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delivery Scheduling — hidden for WALK_IN */}
      {!isWalkIn && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Delivery Scheduling</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Delivery Date</Label>
                <Input
                  type="date"
                  min={minDate}
                  value={deliveryDate ?? minDate}
                  onChange={(e) => {
                    const val = e.target.value
                    // Prevent selecting a date before minDate
                    if (val && val < minDate) {
                      onDeliveryDateChange(minDate)
                    } else {
                      onDeliveryDateChange(val || null)
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">Earliest delivery is tomorrow</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Delivery Time</Label>
                <Select
                  value={deliveryTimeCode ?? 'none'}
                  onValueChange={(v) => onDeliveryTimeCodeChange(v === 'none' ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select time slot" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No preference</SelectItem>
                    {YAMATO_TIME_SLOTS.map((slot) => (
                      <SelectItem key={slot.code} value={slot.code}>
                        {slot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Yamato delivery time slot</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
