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
  conversations?: Array<{ id: string; last_message_at: string | null }> | null
}

/**
 * Pick the customer's most recently active conversation, for deep-linking
 * into /admin/messages?conversation=<id>.
 */
export function latestConversationId(customer: SoldToCustomer | null | undefined): string | null {
  const conversations = customer?.conversations
  if (!conversations || conversations.length === 0) return null
  let latest = conversations[0]
  for (const c of conversations) {
    if ((c.last_message_at ?? '') > (latest.last_message_at ?? '')) latest = c
  }
  return latest.id
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

export type ReservedByInfo =
  | {
      kind: 'order'
      orderId: string
      orderCode: string
      customer: SoldToCustomer
    }
  | {
      kind: 'offer'
      offerId: string
      offerCode: string
      fbName: string
      customer: SoldToCustomer | null
      expiresAt: string | null
    }

type OfferItemWithOffer = {
  offers: {
    id: string
    offer_code: string
    offer_status: string
    fb_name: string
    expires_at: string | null
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

/**
 * Deep link into /admin/messages for a reservation: the linked customer's
 * conversation if one exists, otherwise (offers) lookup by contact name.
 */
export function reservedByMessageLink(reservedBy: ReservedByInfo): string | null {
  const conversationId = latestConversationId(reservedBy.customer)
  if (conversationId) return `/admin/messages?conversation=${conversationId}`
  if (reservedBy.kind === 'offer') return `/admin/messages?contact=${encodeURIComponent(reservedBy.fbName)}`
  return null
}

/**
 * Given an item's `order_items` and `offer_items` relations, return who has the
 * item reserved but not yet confirmed: a PENDING order, or a PENDING offer.
 * Used for follow-up on RESERVED items that resolveSoldTo() doesn't cover.
 */
export function resolveReservedBy(orderItems: unknown, offerItems?: unknown): ReservedByInfo | null {
  if (Array.isArray(orderItems)) {
    for (const oi of orderItems as OrderItemWithOrder[]) {
      const order = oi?.orders
      if (!order || !order.customers) continue
      if (order.order_status !== 'PENDING') continue
      return {
        kind: 'order',
        orderId: order.id,
        orderCode: order.order_code,
        customer: order.customers,
      }
    }
  }

  if (Array.isArray(offerItems)) {
    for (const oi of offerItems as OfferItemWithOffer[]) {
      const offer = oi?.offers
      if (!offer || offer.offer_status !== 'PENDING') continue
      return {
        kind: 'offer',
        offerId: offer.id,
        offerCode: offer.offer_code,
        fbName: offer.fb_name,
        customer: offer.customers,
        expiresAt: offer.expires_at,
      }
    }
  }

  return null
}
