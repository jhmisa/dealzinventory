/**
 * Helpers for resolving which order/customer an item was sold to.
 *
 * An item is considered "sold" when it has an order_items row pointing to an
 * order whose status is CONFIRMED or later (CONFIRMED, PACKED, SHIPPED, DELIVERED).
 * PENDING and CANCELLED orders are excluded — a CONFIRMED order is the signal
 * that payment is on the way (or already received), which is what staff want to track.
 */

export type SoldToCustomer = {
  id: string
  customer_code: string
  first_name: string | null
  last_name: string
  email: string | null
  phone: string | null
}

export type SoldToInfo = {
  orderId: string
  orderCode: string
  orderStatus: string
  customer: SoldToCustomer
}

type OrderItemWithOrder = {
  orders: {
    id: string
    order_code: string
    order_status: string
    customers: SoldToCustomer | null
  } | null
}

const SOLD_ORDER_STATUSES = new Set(['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'])

/**
 * Given an item's `order_items` relation (as returned by the items service),
 * return the customer/order the item was sold to, if any.
 */
export function resolveSoldTo(orderItems: unknown): SoldToInfo | null {
  if (!Array.isArray(orderItems)) return null

  for (const oi of orderItems as OrderItemWithOrder[]) {
    const order = oi?.orders
    if (!order || !order.customers) continue
    if (!SOLD_ORDER_STATUSES.has(order.order_status)) continue
    return {
      orderId: order.id,
      orderCode: order.order_code,
      orderStatus: order.order_status,
      customer: order.customers,
    }
  }

  return null
}
