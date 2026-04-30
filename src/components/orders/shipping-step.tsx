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
import { getEarliestDeliveryDate } from '@/lib/delivery-date'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ShippingAddress } from '@/lib/address-types'
import type { Customer } from '@/lib/types'
import { formatCustomerName } from '@/lib/utils'

interface ReceiverInfo {
  receiverFirstName?: string | null
  receiverLastName?: string | null
  receiverPhone?: string | null
}

interface ShippingStepProps {
  customer: Customer
  orderSource: string
  selectedAddress: { address: ShippingAddress } & ReceiverInfo | null
  onAddressSelect: (address: ShippingAddress, receiver?: ReceiverInfo) => void
  deliveryDate: string | null
  onDeliveryDateChange: (date: string | null) => void
  deliveryTimeCode: string | null
  onDeliveryTimeCodeChange: (code: string | null) => void
  /** Hide the address selection section */
  hideAddress?: boolean
  /** Hide the delivery scheduling section */
  hideScheduling?: boolean
}

function formatReceiverName(receiver: ReceiverInfo): string | undefined {
  const parts = [receiver.receiverFirstName, receiver.receiverLastName].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : undefined
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
  hideAddress,
  hideScheduling,
}: ShippingStepProps) {
  const [showNewForm, setShowNewForm] = useState(false)
  const [receiverType, setReceiverType] = useState<'same' | 'new'>('same')
  const [newReceiverFirstName, setNewReceiverFirstName] = useState('')
  const [newReceiverLastName, setNewReceiverLastName] = useState('')
  const [newReceiverPhone, setNewReceiverPhone] = useState('')
  const [newAddress, setNewAddress] = useState<ShippingAddress | null>(null)
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)

  const { data: savedAddresses, isLoading } = useCustomerAddresses(customer.id)
  const createAddress = useCreateCustomerAddress()

  const isWalkIn = orderSource === 'WALK_IN'

  // Build address list: saved addresses + legacy fallback
  const addressOptions: {
    id: string
    label: string
    receiverFirstName?: string | null
    receiverLastName?: string | null
    receiverPhone?: string | null
    address: ShippingAddress
  }[] = []

  if (savedAddresses) {
    for (const addr of savedAddresses) {
      addressOptions.push({
        id: addr.id,
        label: addr.label,
        receiverFirstName: addr.receiver_first_name,
        receiverLastName: addr.receiver_last_name,
        receiverPhone: addr.receiver_phone,
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
        address: legacyAddr,
      })
    }
  }

  // Earliest selectable delivery date, respecting the 4PM JST cutoff and Mon–Fri processing.
  const minDate = getEarliestDeliveryDate()

  const handleAddressSelect = (id: string) => {
    setSelectedAddressId(id)
    const option = addressOptions.find((a) => a.id === id)
    if (option) {
      onAddressSelect(option.address, {
        receiverFirstName: option.receiverFirstName,
        receiverLastName: option.receiverLastName,
        receiverPhone: option.receiverPhone,
      })
    }
  }

  const handleSaveNewAddress = async () => {
    if (!newAddress) return

    const hasReceiver = receiverType === 'new' && (newReceiverFirstName || newReceiverLastName)
    const label = `Address ${addressOptions.length + 1}`

    try {
      const saved = await createAddress.mutateAsync({
        customer_id: customer.id,
        label,
        address: newAddress as unknown as Record<string, unknown>,
        is_default: addressOptions.length === 0,
        receiver_first_name: hasReceiver ? (newReceiverFirstName || null) : null,
        receiver_last_name: hasReceiver ? (newReceiverLastName || null) : null,
        receiver_phone: hasReceiver ? (newReceiverPhone || null) : null,
      })

      onAddressSelect(newAddress, {
        receiverFirstName: hasReceiver ? (newReceiverFirstName || null) : null,
        receiverLastName: hasReceiver ? (newReceiverLastName || null) : null,
        receiverPhone: hasReceiver ? (newReceiverPhone || null) : null,
      })
      setSelectedAddressId(saved.id)
      setShowNewForm(false)
      setReceiverType('same')
      setNewReceiverFirstName('')
      setNewReceiverLastName('')
      setNewReceiverPhone('')
      setNewAddress(null)
    } catch (err) {
      toast.error('Failed to save address. Please try again.')
    }
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
      {!hideAddress && <Card>
        <CardHeader>
          <CardTitle className="text-base">Shipping Address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {addressOptions.length > 0 && (
            <RadioGroup value={selectedAddressId ?? ''} onValueChange={handleAddressSelect}>
              {addressOptions.map((option) => {
                const receiverName = formatReceiverName({
                  receiverFirstName: option.receiverFirstName,
                  receiverLastName: option.receiverLastName,
                })
                return (
                  <div key={option.id} className="flex items-start gap-3 p-3 rounded-md border hover:bg-accent/50 transition-colors">
                    <RadioGroupItem value={option.id} id={option.id} className="mt-1" />
                    <label htmlFor={option.id} className="flex-1 cursor-pointer">
                      <p className="font-medium text-sm">{option.label}</p>
                      {receiverName && (
                        <p className="text-sm text-muted-foreground">Receiver: {receiverName}</p>
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
                )
              })}
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
              {/* Receiver section — only show radio when customer already has addresses */}
              {addressOptions.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Receiver</Label>
                  <RadioGroup
                    value={receiverType}
                    onValueChange={(v: 'same' | 'new') => setReceiverType(v)}
                    className="flex gap-4"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="same" id="receiver-same" />
                      <label htmlFor="receiver-same" className="text-sm cursor-pointer">
                        Same as account holder ({formatCustomerName(customer)})
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="new" id="receiver-new" />
                      <label htmlFor="receiver-new" className="text-sm cursor-pointer">
                        Different receiver
                      </label>
                    </div>
                  </RadioGroup>
                </div>
              )}

              {receiverType === 'new' && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm">First Name</Label>
                    <Input
                      placeholder="First name"
                      value={newReceiverFirstName}
                      onChange={(e) => setNewReceiverFirstName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Last Name</Label>
                    <Input
                      placeholder="Last name"
                      value={newReceiverLastName}
                      onChange={(e) => setNewReceiverLastName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Phone</Label>
                    <Input
                      placeholder="Phone number"
                      value={newReceiverPhone}
                      onChange={(e) => setNewReceiverPhone(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <AddressForm
                value={newAddress}
                onChange={setNewAddress}
              />

              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveNewAddress}
                  disabled={!newAddress || createAddress.isPending}
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
      </Card>}

      {/* Delivery Scheduling — hidden for WALK_IN */}
      {!isWalkIn && !hideScheduling && (
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
                  value={(deliveryDate && deliveryDate >= minDate) ? deliveryDate : minDate}
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
                <p className="text-xs text-muted-foreground">
                  Orders placed after 4PM JST or on weekends ship the next business day
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Delivery Time</Label>
                <Select
                  value={deliveryTimeCode ?? ''}
                  onValueChange={(v) => onDeliveryTimeCodeChange(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a time slot" />
                  </SelectTrigger>
                  <SelectContent>
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
