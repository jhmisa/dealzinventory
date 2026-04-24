import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { PageHeader } from '@/components/shared'
import { CustomerPicker } from '@/components/orders/customer-picker'
import { ShippingStep } from '@/components/orders/shipping-step'
import { OrderLineItems } from '@/components/orders/order-line-items'
import type { OrderLineItem } from '@/components/orders/order-line-items'
import { useCreateManualOrder } from '@/hooks/use-orders'
import { getEarliestDeliveryDate } from '@/lib/delivery-date'
import { toast } from 'sonner'
import type { Customer } from '@/lib/types'
import type { ShippingAddress } from '@/lib/address-types'

export default function CreateOrderPage() {
  const navigate = useNavigate()
  const createOrder = useCreateManualOrder()

  // Section 1: Customer
  const [customer, setCustomer] = useState<Customer | null>(null)

  // Section 2: Shipping
  const [shippingAddress, setShippingAddress] = useState<ShippingAddress | null>(null)
  const [receiverFirstName, setReceiverFirstName] = useState<string | null>(null)
  const [receiverLastName, setReceiverLastName] = useState<string | null>(null)
  const [receiverPhone, setReceiverPhone] = useState<string | null>(null)
  // Default delivery date to earliest allowed (respects 4PM JST cutoff + Mon–Fri processing)
  const [deliveryDate, setDeliveryDate] = useState<string | null>(getEarliestDeliveryDate())
  const [deliveryTimeCode, setDeliveryTimeCode] = useState<string | null>(null)

  // Section 3: Order
  const [lineItems, setLineItems] = useState<OrderLineItem[]>([])
  const [shippingCost, setShippingCost] = useState(1000)
  const [orderSource, setOrderSource] = useState<string>('SHOP')
  const [notes, setNotes] = useState('')

  const handleAddressSelect = (address: ShippingAddress, receiver?: { receiverFirstName?: string | null; receiverLastName?: string | null; receiverPhone?: string | null }) => {
    setShippingAddress(address)
    setReceiverFirstName(receiver?.receiverFirstName ?? null)
    setReceiverLastName(receiver?.receiverLastName ?? null)
    setReceiverPhone(receiver?.receiverPhone ?? null)
  }

  const canSubmit =
    !!customer &&
    !!shippingAddress &&
    lineItems.length > 0 &&
    !!orderSource &&
    lineItems.every((li) => li.description.trim().length > 0)

  const handleSubmit = async () => {
    if (!customer || !shippingAddress || lineItems.length === 0) return

    try {
      const order = await createOrder.mutateAsync({
        customer_id: customer.id,
        order_source: orderSource,
        shipping_address: JSON.stringify(shippingAddress),
        delivery_date: deliveryDate,
        delivery_time_code: deliveryTimeCode,
        notes: notes || null,
        shipping_cost: shippingCost,
        receiver_first_name: receiverFirstName,
        receiver_last_name: receiverLastName,
        receiver_phone: receiverPhone,
        items: lineItems.map((li) => ({
          item_id: li.item_id,
          accessory_id: li.accessory_id ?? null,
          description: li.description,
          quantity: li.quantity,
          unit_price: li.unit_price,
          discount: li.discount,
        })),
      })

      toast.success(`Order ${order.order_code} created`)
      navigate(`/admin/orders/${order.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create order')
    }
  }

  return (
    <div className="space-y-8 pb-24">
      <PageHeader
        title="Create Order"
        description="Manually create an order for a customer."
      />

      {/* Section 1: Customer */}
      <section>
        <h2 className="text-lg font-semibold mb-3">1. Customer</h2>
        <CustomerPicker
          selectedCustomer={customer}
          onSelect={(c) => {
            setCustomer(c)
            if (!c) {
              setShippingAddress(null)
              setReceiverFirstName(null)
              setReceiverLastName(null)
              setReceiverPhone(null)
            }
          }}
        />
      </section>

      {/* Section 2: Shipping & Delivery */}
      <section className={!customer ? 'opacity-50 pointer-events-none' : ''}>
        <h2 className="text-lg font-semibold mb-3">2. Shipping & Delivery</h2>
        {customer ? (
          <ShippingStep
            customer={customer}
            orderSource={orderSource}
            selectedAddress={shippingAddress ? { address: shippingAddress, receiverFirstName, receiverLastName, receiverPhone } : null}
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

      {/* Section 3: Order */}
      <section className={!shippingAddress ? 'opacity-50 pointer-events-none' : ''}>
        <h2 className="text-lg font-semibold mb-3">3. Order</h2>
        {shippingAddress ? (
          <OrderLineItems
            lineItems={lineItems}
            onLineItemsChange={setLineItems}
            shippingCost={shippingCost}
            onShippingCostChange={setShippingCost}
            orderSource={orderSource}
            onOrderSourceChange={setOrderSource}
            notes={notes}
            onNotesChange={setNotes}
            onSubmit={handleSubmit}
            isSubmitting={createOrder.isPending}
            canSubmit={canSubmit}
          />
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Select a shipping address first
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
