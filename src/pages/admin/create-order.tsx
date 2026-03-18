import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared'
import { CustomerPicker } from '@/components/orders/customer-picker'
import { ShippingStep } from '@/components/orders/shipping-step'
import { ItemBrowser } from '@/components/orders/item-browser'
import { OrderReview } from '@/components/orders/order-review'
import { useCreateManualOrder } from '@/hooks/use-orders'
import { useToast } from '@/hooks/use-toast'
import type { Customer } from '@/lib/types'
import type { ShippingAddress } from '@/lib/address-types'
import type { ManualOrderItemValues } from '@/validators/manual-order'

export default function CreateOrderPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const createOrder = useCreateManualOrder()

  // Step 1: Customer
  const [customer, setCustomer] = useState<Customer | null>(null)

  // Step 2: Shipping
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null)
  const [careOf, setCareOf] = useState<string | null>(null)
  const [deliveryDate, setDeliveryDate] = useState<string | null>(null)
  const [deliveryTimeCode, setDeliveryTimeCode] = useState<string | null>(null)

  // Step 3: Items
  const [selectedItems, setSelectedItems] = useState<ManualOrderItemValues[]>([])

  // Step 4: Review
  const [orderSource, setOrderSource] = useState<string>('SHOP')
  const [notes, setNotes] = useState('')

  const handleAddressSelect = (address: ShippingAddress, co?: string | null) => {
    setShippingAddress(address)
    setCareOf(co ?? null)
  }

  const handleToggleItem = (item: ManualOrderItemValues) => {
    setSelectedItems((prev) => {
      const exists = prev.find((i) => i.item_id === item.item_id)
      if (exists) {
        return prev.filter((i) => i.item_id !== item.item_id)
      }
      return [...prev, item]
    })
  }

  const handlePriceChange = (itemId: string, price: number) => {
    setSelectedItems((prev) =>
      prev.map((i) => (i.item_id === itemId ? { ...i, unit_price: price } : i))
    )
  }

  const handleRemoveItem = (itemId: string) => {
    setSelectedItems((prev) => prev.filter((i) => i.item_id !== itemId))
  }

  const handleSubmit = async () => {
    if (!customer || !shippingAddress || selectedItems.length === 0) return

    try {
      const order = await createOrder.mutateAsync({
        customer_id: customer.id,
        order_source: orderSource,
        shipping_address: JSON.stringify(shippingAddress),
        delivery_date: deliveryDate,
        delivery_time_code: deliveryTimeCode,
        notes: notes || null,
        items: selectedItems.map((i) => ({
          item_id: i.item_id,
          unit_price: i.unit_price,
        })),
      })

      toast({
        title: 'Order created',
        description: `Order ${order.order_code} has been created.`,
      })

      navigate(`/admin/orders/${order.id}`)
    } catch (error) {
      toast({
        title: 'Failed to create order',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-8 pb-24">
      <PageHeader
        title="Create Order"
        description="Manually create an order for a customer."
      />

      {/* Step 1: Customer */}
      <section>
        <h2 className="text-lg font-semibold mb-3">1. Customer</h2>
        <CustomerPicker
          selectedCustomer={customer}
          onSelect={(c) => {
            setCustomer(c)
            // Reset downstream when customer changes
            if (!c) {
              setShippingAddress(null)
              setCareOf(null)
            }
          }}
        />
      </section>

      {/* Step 2: Shipping & Delivery */}
      <section className={!customer ? 'opacity-50 pointer-events-none' : ''}>
        <h2 className="text-lg font-semibold mb-3">2. Shipping & Delivery</h2>
        {customer ? (
          <ShippingStep
            customer={customer}
            orderSource={orderSource}
            selectedAddress={shippingAddress ? { address: shippingAddress, careOf } : null}
            onAddressSelect={handleAddressSelect}
            deliveryDate={deliveryDate}
            onDeliveryDateChange={setDeliveryDate}
            deliveryTimeCode={deliveryTimeCode}
            onDeliveryTimeCodeChange={setDeliveryTimeCode}
          />
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Select a customer first
            </CardContent>
          </Card>
        )}
      </section>

      {/* Step 3: Items */}
      <section className={!shippingAddress ? 'opacity-50 pointer-events-none' : ''}>
        <h2 className="text-lg font-semibold mb-3">3. Items</h2>
        {shippingAddress ? (
          <ItemBrowser
            selectedItems={selectedItems}
            onToggleItem={handleToggleItem}
            onPriceChange={handlePriceChange}
            onRemoveItem={handleRemoveItem}
          />
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Select a shipping address first
            </CardContent>
          </Card>
        )}
      </section>

      {/* Step 4: Review & Submit */}
      <section>
        <h2 className="text-lg font-semibold mb-3">4. Review & Submit</h2>
        <OrderReview
          customer={customer}
          orderSource={orderSource}
          onOrderSourceChange={setOrderSource}
          shippingAddress={shippingAddress}
          careOf={careOf}
          deliveryDate={deliveryDate}
          deliveryTimeCode={deliveryTimeCode}
          items={selectedItems}
          notes={notes}
          onNotesChange={setNotes}
          onSubmit={handleSubmit}
          isSubmitting={createOrder.isPending}
        />
      </section>
    </div>
  )
}
