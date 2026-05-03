import { formatPrice } from '@/lib/utils'
import { YAMATO_TRACKING_URL, YAMATO_TIME_SLOTS } from '@/lib/constants'
import type { ShippingAddress } from '@/lib/address-types'
import { serializeAddress } from '@/lib/address-types'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

function formatTimeSlot(code: string | null | undefined): string {
  if (!code) return ''
  const slot = YAMATO_TIME_SLOTS.find(s => s.code === code)
  return slot ? slot.label_en : code
}

function formatDeliveryLine(date: string | null | undefined, timeCode: string | null | undefined): string {
  if (!date) return 'TBD'
  const d = new Date(date + 'T00:00:00')
  const day = DAY_NAMES[d.getDay()]
  const timeSlot = formatTimeSlot(timeCode)
  return timeSlot ? `${date} (${day} ${timeSlot})` : `${date} (${day})`
}

interface OrderSummaryInput {
  order_code: string
  delivery_date: string | null
  delivery_time_code: string | null
  receiver_first_name: string | null
  receiver_last_name: string | null
  shipping_address: string | null
  shipping_cost: number | null
  total_price: number | null
  tracking_number: string | null
  carrier: string | null
  customers: {
    customer_code: string
    last_name: string
    first_name: string | null
  } | null
  order_items: Array<{
    description: string | null
    quantity: number
    unit_price: number | null
  }>
}

export function formatOrderSummary(order: OrderSummaryInput): string {
  const lines: string[] = []

  // Order code
  lines.push(`📦 Order: ${order.order_code}`)

  // Delivery
  lines.push(`📅 Delivery: ${formatDeliveryLine(order.delivery_date, order.delivery_time_code)}`)

  // Customer
  const customer = order.customers
  if (customer) {
    const name = [order.receiver_first_name, order.receiver_last_name].filter(Boolean).join(' ')
      || [customer.first_name, customer.last_name].filter(Boolean).join(' ')
    lines.push(`👤 ${customer.customer_code} — ${name}`)
  }

  // Address
  if (order.shipping_address) {
    try {
      const addr: ShippingAddress = JSON.parse(order.shipping_address)
      lines.push(`📍 ${serializeAddress(addr).replace(/\n/g, ', ')}`)
    } catch {
      lines.push(`📍 ${order.shipping_address}`)
    }
  }

  // Items
  const items = order.order_items ?? []
  if (items.length > 0) {
    lines.push('')
    lines.push('Items:')
    for (const item of items) {
      const desc = item.description || 'Item'
      const price = item.unit_price != null ? ` — ${formatPrice(item.unit_price)}` : ''
      lines.push(`${item.quantity}x ${desc}${price}`)
    }
  }

  // Delivery fee
  if (order.shipping_cost && order.shipping_cost > 0) {
    lines.push('')
    lines.push(`🚚 Delivery Fee: ${formatPrice(order.shipping_cost)}`)
  }

  // Total
  lines.push(`💰 Total: ${formatPrice(order.total_price)}`)

  // Tracking
  if (order.tracking_number) {
    lines.push('')
    const carrier = (order.carrier ?? 'yamato').toLowerCase()
    lines.push(`🚚 Tracking: ${order.tracking_number}`)
    if (carrier === 'yamato' || carrier === '') {
      lines.push(`${YAMATO_TRACKING_URL}?pno=${order.tracking_number}`)
    }
  }

  return lines.join('\n')
}
