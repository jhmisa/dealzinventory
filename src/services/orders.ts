import { supabase } from '@/lib/supabase'
import type { Order, OrderInsert, OrderUpdate, Item } from '@/lib/types'

interface OrderFilters {
  search?: string
  status?: string
  source?: string
  customerId?: string
}

export async function getOrders(filters: OrderFilters = {}) {
  // If searching, first find matching customer IDs (PostgREST can't .or() across joins)
  let matchingCustomerIds: string[] | null = null
  if (filters.search) {
    const term = filters.search
    const { data: customers } = await supabase
      .from('customers')
      .select('id')
      .or(
        `customer_code.ilike.%${term}%,last_name.ilike.%${term}%,first_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`
      )
    matchingCustomerIds = customers?.map((c) => c.id) ?? []
  }

  // Also search by receiver name on orders directly
  let receiverOrderIds: string[] | null = null
  if (filters.search) {
    const term = filters.search
    const { data: receiverOrders } = await supabase
      .from('orders')
      .select('id')
      .or(
        `receiver_first_name.ilike.%${term}%,receiver_last_name.ilike.%${term}%`
      )
    receiverOrderIds = receiverOrders?.map((o) => o.id) ?? []
  }

  let query = supabase
    .from('orders')
    .select(`
      *,
      customers(customer_code, last_name, first_name, email, phone),
      sell_groups(sell_group_code, condition_grade, base_price,
        product_models(brand, model_name, cpu, ram_gb, storage_gb, short_description)
      ),
      order_items(count)
    `)
    .order('delivery_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (filters.search) {
    // Match orders by order_code, customer, or receiver name
    const orParts = [`order_code.ilike.%${filters.search}%`]
    if (matchingCustomerIds && matchingCustomerIds.length > 0) {
      orParts.push(`customer_id.in.(${matchingCustomerIds.join(',')})`)
    }
    if (receiverOrderIds && receiverOrderIds.length > 0) {
      orParts.push(`id.in.(${receiverOrderIds.join(',')})`)
    }
    query = query.or(orParts.join(','))
  }
  if (filters.status) {
    query = query.eq('order_status', filters.status)
  }
  if (filters.source) {
    query = query.eq('order_source', filters.source)
  }
  if (filters.customerId) {
    query = query.eq('customer_id', filters.customerId)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getOrder(id: string) {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      customers(customer_code, last_name, first_name, email, phone),
      sell_groups(sell_group_code, condition_grade, base_price,
        product_models(brand, model_name, color, cpu, ram_gb, storage_gb)
      ),
      order_items(
        id, item_id, accessory_id, description, quantity, unit_price, discount, packed_at, packed_by,
        items(id, item_code, condition_grade, condition_notes, item_status,
          cpu, ram_gb, storage_gb, screen_size, os_family, color,
          product_models(brand, model_name, color, cpu, ram_gb, storage_gb, screen_size, os_family, short_description,
            categories(description_fields),
            product_media(file_url, role, sort_order)
          )
        ),
        accessories(id, accessory_code, name, brand, selling_price,
          accessory_media(file_url, sort_order)
        )
      )
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function generateOrderCode(): Promise<string> {
  const { data, error } = await supabase.rpc('generate_code', {
    prefix: 'ORD',
    seq_name: 'ord_code_seq',
  })

  if (error) throw error
  return data as string
}

export async function createOrder(order: OrderInsert) {
  const { data, error } = await supabase
    .from('orders')
    .insert(order)
    .select()
    .single()

  if (error) throw error
  return data as Order
}

export async function updateOrder(id: string, updates: OrderUpdate) {
  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Order
}

export async function updateOrderStatus(id: string, status: string) {
  return updateOrder(id, { order_status: status as Order['order_status'] })
}

export async function cancelOrder(
  orderId: string,
  cancellationCategory?: string,
  cancellationNotes?: string,
) {
  // Get all line items in this order
  const { data: orderItems } = await supabase
    .from('order_items')
    .select('item_id, accessory_id, quantity')
    .eq('order_id', orderId)

  // Update order status to CANCELLED with reason
  const updates: OrderUpdate = { order_status: 'CANCELLED' as Order['order_status'] }
  if (cancellationCategory) updates.cancellation_category = cancellationCategory
  if (cancellationNotes) updates.cancellation_notes = cancellationNotes
  const order = await updateOrder(orderId, updates)

  // Revert all inventory items to AVAILABLE
  const itemIds = (orderItems ?? [])
    .map((oi) => oi.item_id)
    .filter((id): id is string => !!id)
  if (itemIds.length > 0) {
    await supabase
      .from('items')
      .update({ item_status: 'AVAILABLE' as Item['item_status'] })
      .in('id', itemIds)
  }

  // Restore accessory stock
  const accessoryItems = (orderItems ?? []).filter(
    (oi) => oi.accessory_id !== null
  )
  for (const oi of accessoryItems) {
    await supabase.rpc('increment_accessory_stock', {
      p_accessory_id: oi.accessory_id!,
      p_quantity: oi.quantity,
    })
  }

  // NULL out item_ids on cancelled order's items to free the unique index for re-use
  if (itemIds.length > 0) {
    await supabase
      .from('order_items')
      .update({ item_id: null })
      .eq('order_id', orderId)
      .not('item_id', 'is', null)
  }

  return order
}

export async function markOrderItemsSold(orderId: string) {
  const { data: orderItems } = await supabase
    .from('order_items')
    .select('item_id')
    .eq('order_id', orderId)
    .not('item_id', 'is', null)

  const itemIds = (orderItems ?? []).map((oi) => oi.item_id).filter((id): id is string => !!id)
  if (itemIds.length > 0) {
    await supabase
      .from('items')
      .update({ item_status: 'SOLD' as Item['item_status'] })
      .in('id', itemIds)
  }
}

// Reset all packing progress on an order (clear packed_at/packed_by on all order_items and packed_date/packed_by on order)
export async function resetOrderPacking(orderId: string) {
  // Clear packed_at on all order_items
  await supabase
    .from('order_items')
    .update({ packed_at: null, packed_by: null })
    .eq('order_id', orderId)

  // Clear packed_date on the order
  await supabase
    .from('orders')
    .update({ packed_date: null, packed_by: null })
    .eq('id', orderId)
}

// Mark an order item as packed
export async function packOrderItem(orderItemId: string, packedBy: string) {
  const { data, error } = await supabase
    .from('order_items')
    .update({ packed_at: new Date().toISOString(), packed_by: packedBy })
    .eq('id', orderItemId)
    .select()
    .single()

  if (error) throw error
  return data
}

// --- Available Items for Manual Order ---

interface AvailableItemFilters {
  search?: string
  grade?: string
  page?: number
  pageSize?: number
}

export async function getAvailableItems(filters: AvailableItemFilters = {}) {
  const page = filters.page ?? 0
  const pageSize = filters.pageSize ?? 20
  const from = page * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('items')
    .select(`
      id, item_code, condition_grade, selling_price, item_status,
      product_models(id, brand, model_name, color,
        product_media(file_url, role, sort_order)
      )
    `, { count: 'exact' })
    .eq('item_status', 'AVAILABLE')
    .neq('condition_grade', 'J')
    .order('created_at', { ascending: false })
    .range(from, to)

  if (filters.search) {
    query = query.ilike('item_code', `%${filters.search}%`)
  }
  if (filters.grade) {
    query = query.eq('condition_grade', filters.grade)
  }

  const { data, error, count } = await query
  if (error) throw error

  // If searching and got few results from item_code, also search by product model name
  let items = data ?? []
  if (filters.search && items.length < pageSize) {
    const { data: modelResults, error: modelError } = await supabase
      .from('items')
      .select(`
        id, item_code, condition_grade, selling_price, item_status,
        product_models!inner(id, brand, model_name, color,
          product_media(file_url, role, sort_order)
        )
      `)
      .eq('item_status', 'AVAILABLE')
      .neq('condition_grade', 'J')
      .or(
        `brand.ilike.%${filters.search}%,model_name.ilike.%${filters.search}%`,
        { referencedTable: 'product_models' }
      )
      .order('created_at', { ascending: false })
      .limit(pageSize)

    if (!modelError && modelResults) {
      const existingIds = new Set(items.map((i) => i.id))
      for (const item of modelResults) {
        if (!existingIds.has(item.id)) {
          items.push(item)
        }
      }
    }
  }

  return { items, total: count ?? items.length }
}

// --- Manual Order Creation ---

interface ManualOrderInput {
  customer_id: string
  order_source: string
  shipping_address: string
  delivery_date?: string | null
  delivery_time_code?: string | null
  notes?: string | null
  shipping_cost: number
  receiver_first_name?: string | null
  receiver_last_name?: string | null
  receiver_phone?: string | null
  items: {
    item_id: string | null
    accessory_id?: string | null
    description: string
    quantity: number
    unit_price: number
    discount: number
  }[]
}

export async function createManualOrder(input: ManualOrderInput) {
  const orderCode = await generateOrderCode()

  const quantity = input.items.reduce((sum, item) => sum + item.quantity, 0)
  const totalPrice =
    input.items.reduce(
      (sum, item) => sum + item.unit_price * item.quantity - item.discount,
      0
    ) + input.shipping_cost

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .insert({
      order_code: orderCode,
      customer_id: input.customer_id,
      order_source: input.order_source as Order['order_source'],
      shipping_address: input.shipping_address,
      quantity,
      total_price: totalPrice,
      delivery_date: input.delivery_date ?? null,
      delivery_time_code: input.delivery_time_code ?? null,
      notes: input.notes ?? null,
      shipping_cost: input.shipping_cost,
      receiver_first_name: input.receiver_first_name ?? null,
      receiver_last_name: input.receiver_last_name ?? null,
      receiver_phone: input.receiver_phone ?? null,
      sell_group_id: null,
    })
    .select()
    .single()

  if (orderError) throw orderError

  const orderItems = input.items.map((item) => ({
    order_id: (order as Order).id,
    item_id: item.item_id,
    accessory_id: item.accessory_id ?? null,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    discount: item.discount,
  }))

  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems)

  if (itemsError) {
    await supabase.from('orders').delete().eq('id', (order as Order).id)
    if (itemsError.message.includes('unique') || itemsError.message.includes('duplicate')) {
      throw new Error('One or more items are no longer available. Please refresh and try again.')
    }
    throw itemsError
  }

  // Mark inventory items as RESERVED
  const inventoryItemIds = input.items
    .map((item) => item.item_id)
    .filter((id): id is string => id !== null)

  if (inventoryItemIds.length > 0) {
    await supabase
      .from('items')
      .update({ item_status: 'RESERVED' as Item['item_status'] })
      .in('id', inventoryItemIds)
  }

  // Decrement accessory stock
  const accessoryLineItems = input.items.filter((item) => item.accessory_id)
  for (const item of accessoryLineItems) {
    const { data: newQty } = await supabase.rpc('decrement_accessory_stock', {
      p_accessory_id: item.accessory_id!,
      p_quantity: item.quantity,
    })
    if (newQty === null) {
      throw new Error(`Insufficient stock for accessory. Please refresh and try again.`)
    }
  }

  return order as Order
}

// --- Order Editing ---

export async function updateOrderLineItem(
  orderItemId: string,
  updates: { unit_price?: number; discount?: number; quantity?: number; description?: string }
) {
  const { data, error } = await supabase
    .from('order_items')
    .update(updates)
    .eq('id', orderItemId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function addOrderLineItem(orderId: string, item: {
  item_id: string | null
  accessory_id?: string | null
  description: string
  quantity: number
  unit_price: number
  discount: number
}) {
  const { data, error } = await supabase
    .from('order_items')
    .insert({ order_id: orderId, ...item })
    .select()
    .single()

  if (error) throw error

  // Mark inventory item as RESERVED
  if (item.item_id) {
    await supabase
      .from('items')
      .update({ item_status: 'RESERVED' as Item['item_status'] })
      .eq('id', item.item_id)
  }

  // Decrement accessory stock
  if (item.accessory_id) {
    const { data: newQty } = await supabase.rpc('decrement_accessory_stock', {
      p_accessory_id: item.accessory_id,
      p_quantity: item.quantity,
    })
    if (newQty === null) {
      throw new Error('Insufficient stock for accessory. Please refresh and try again.')
    }
  }

  return data
}

export async function removeOrderLineItem(orderItemId: string) {
  // Fetch the order_item to get item_id before deleting
  const { data: orderItem } = await supabase
    .from('order_items')
    .select('item_id')
    .eq('id', orderItemId)
    .single()

  const { error } = await supabase
    .from('order_items')
    .delete()
    .eq('id', orderItemId)

  if (error) throw error

  // Revert inventory item to AVAILABLE
  if (orderItem?.item_id) {
    await supabase
      .from('items')
      .update({ item_status: 'AVAILABLE' as Item['item_status'] })
      .eq('id', orderItem.item_id)
  }
}

export async function recalculateOrderTotal(orderId: string) {
  // Fetch current line items and shipping cost
  const { data: order } = await supabase
    .from('orders')
    .select('shipping_cost')
    .eq('id', orderId)
    .single()

  const { data: items } = await supabase
    .from('order_items')
    .select('unit_price, quantity, discount')
    .eq('order_id', orderId)

  if (!items) return

  const shippingCost = (order as Record<string, unknown>)?.shipping_cost as number ?? 0
  const quantity = items.reduce((sum, i) => sum + i.quantity, 0)
  const totalPrice = items.reduce(
    (sum, i) => sum + i.unit_price * i.quantity - i.discount, 0
  ) + shippingCost

  await supabase
    .from('orders')
    .update({ quantity, total_price: totalPrice })
    .eq('id', orderId)
}

// --- Order Audit Logs ---

export async function getOrderAuditLogs(orderId: string) {
  const { data, error } = await supabase
    .from('order_audit_logs')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

// Get orders ready for packing (CONFIRMED status)
export async function getPackableOrders() {
  // Only show CONFIRMED orders with delivery_date within 3 days (or no delivery date = pack ASAP)
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() + 3)
  const cutoff = cutoffDate.toISOString().split('T')[0]

  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      customers(customer_code, last_name, first_name),
      sell_groups(sell_group_code, condition_grade,
        product_models(brand, model_name)
      ),
      order_items(
        id, packed_at, description, item_id, accessory_id, quantity,
        items(id, item_code),
        accessories(id, accessory_code, name)
      )
    `)
    .eq('order_status', 'CONFIRMED')
    .or(`delivery_date.is.null,delivery_date.lte.${cutoff}`)
    .order('delivery_date', { ascending: true, nullsFirst: true })

  if (error) throw error
  return data ?? []
}

// --- Print Tracking ---

export async function getConfirmedOrdersForInvoice() {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      customers(customer_code, last_name, first_name, email, phone),
      sell_groups(sell_group_code, condition_grade, base_price,
        product_models(brand, model_name, color, cpu, ram_gb, storage_gb)
      ),
      order_items(
        id, item_id, description, quantity, unit_price, discount,
        items(id, item_code, condition_grade, condition_notes, item_status,
          cpu, ram_gb, storage_gb, screen_size, os_family, color,
          product_models(brand, model_name, color, cpu, ram_gb, storage_gb, screen_size, os_family, short_description,
            categories(description_fields),
            product_media(file_url, role, sort_order)
          )
        )
      )
    `)
    .eq('order_status', 'CONFIRMED')
    .is('invoice_printed_at', null)
    .order('delivery_date', { ascending: true, nullsFirst: false })

  if (error) throw error
  return data ?? []
}

export async function getConfirmedOrdersForDempyo() {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      customers(customer_code, last_name, first_name, email, phone),
      order_items(
        id, item_id, description, quantity, unit_price, discount,
        items(id, item_code)
      )
    `)
    .eq('order_status', 'CONFIRMED')
    .is('dempyo_printed_at', null)
    .order('delivery_date', { ascending: true, nullsFirst: false })

  if (error) throw error
  return data ?? []
}

export async function stampInvoicePrinted(orderIds: string[]) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('orders')
    .update({ invoice_printed_at: now })
    .in('id', orderIds)

  if (error) throw error
}

export async function stampDempyoPrinted(orderIds: string[]) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('orders')
    .update({ dempyo_printed_at: now })
    .in('id', orderIds)

  if (error) throw error
}

export async function clearInvoicePrinted(orderIds: string[]) {
  const { error } = await supabase
    .from('orders')
    .update({ invoice_printed_at: null })
    .in('id', orderIds)

  if (error) throw error
}

export async function clearDempyoPrinted(orderIds: string[]) {
  const { error } = await supabase
    .from('orders')
    .update({ dempyo_printed_at: null })
    .in('id', orderIds)

  if (error) throw error
}

// --- Yamato Tracking Import ---

export interface TrackingImportResult {
  updated: string[]
  skipped: { orderCode: string; reason: string }[]
}

export async function bulkApplyTracking(
  updates: { orderCode: string; trackingNumber: string }[],
  autoAdvance: boolean,
): Promise<TrackingImportResult> {
  const orderCodes = updates.map((u) => u.orderCode)
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, order_code, order_status, tracking_number')
    .in('order_code', orderCodes)

  if (error) throw error

  const orderMap = new Map((orders ?? []).map((o) => [o.order_code, o]))
  const updated: string[] = []
  const skipped: TrackingImportResult['skipped'] = []

  for (const { orderCode, trackingNumber } of updates) {
    const order = orderMap.get(orderCode)
    if (!order) {
      skipped.push({ orderCode, reason: 'Order not found' })
      continue
    }

    if (order.order_status === 'CANCELLED' || order.order_status === 'DELIVERED') {
      skipped.push({ orderCode, reason: `Order is ${order.order_status}` })
      continue
    }

    // Same tracking already applied — no-op
    if (order.tracking_number === trackingNumber) {
      skipped.push({ orderCode, reason: 'Already applied' })
      continue
    }

    const updateFields: Record<string, unknown> = { tracking_number: trackingNumber }

    // Auto-advance to SHIPPED if not already shipped
    const shouldAdvance =
      autoAdvance &&
      order.order_status !== 'SHIPPED' &&
      order.order_status !== 'DELIVERED' &&
      order.order_status !== 'CANCELLED'

    if (shouldAdvance) {
      updateFields.order_status = 'SHIPPED'
      updateFields.shipped_date = new Date().toISOString()
    }

    const { error: updateErr } = await supabase
      .from('orders')
      .update(updateFields)
      .eq('id', order.id)

    if (updateErr) {
      skipped.push({ orderCode, reason: updateErr.message })
      continue
    }

    // Mark items as SOLD when advancing to SHIPPED
    if (shouldAdvance) {
      await markOrderItemsSold(order.id)
    }

    updated.push(orderCode)
  }

  return { updated, skipped }
}

// --- Yamato Tracking ---

export async function checkYamatoTracking(orderId: string, trackingNumber: string) {
  const { data, error } = await supabase.functions.invoke('yamato-tracking', {
    body: { orders: [{ order_id: orderId, tracking_number: trackingNumber }] },
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  // Check per-order errors in results array
  const results = data?.results as Array<{ error?: string; yamato_status?: string | null }> | undefined
  if (results?.length === 1 && results[0].error && !results[0].yamato_status) {
    throw new Error(results[0].error)
  }
  return data
}

export async function refreshAllYamatoStatuses() {
  // Fetch all SHIPPED orders that have a tracking number
  const { data: orders, error: fetchError } = await supabase
    .from('orders')
    .select('id, order_code, tracking_number')
    .eq('order_status', 'SHIPPED')
    .not('tracking_number', 'is', null)

  if (fetchError) throw fetchError
  if (!orders || orders.length === 0) return { total: 0, updated: 0, errors: 0 }

  // Edge function accepts max 10 per request — batch accordingly
  const BATCH_SIZE = 10
  let updated = 0
  let errors = 0

  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batch = orders.slice(i, i + BATCH_SIZE).map((o) => ({
      order_id: o.id,
      tracking_number: o.tracking_number!,
    }))

    const { data, error } = await supabase.functions.invoke('yamato-tracking', {
      body: { orders: batch },
    })

    if (error) {
      errors += batch.length
      continue
    }

    const results = data?.results as Array<{ error?: string }> | undefined
    if (results) {
      for (const r of results) {
        if (r.error) errors++
        else updated++
      }
    }
  }

  return { total: orders.length, updated, errors }
}

export async function getDeliveryIssueOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      customers(customer_code, last_name, first_name, email, phone),
      order_items(count)
    `)
    .eq('delivery_issue_flag', true)
    .eq('order_status', 'SHIPPED')
    .order('yamato_last_checked_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

// --- Merge Orders ---

export async function getMergeableOrders(orderId: string) {
  // Fetch the source order to get customer_id + delivery_date
  const { data: source, error: srcErr } = await supabase
    .from('orders')
    .select('id, customer_id, delivery_date')
    .eq('id', orderId)
    .single()

  if (srcErr) throw srcErr
  if (!source) throw new Error('Source order not found')

  // Find other orders from same customer with same delivery date, PENDING or CONFIRMED
  let query = supabase
    .from('orders')
    .select(`
      id, order_code, order_status, quantity, total_price, delivery_date, delivery_time_code,
      order_items(count)
    `)
    .eq('customer_id', source.customer_id)
    .neq('id', orderId)
    .in('order_status', ['PENDING', 'CONFIRMED'])
    .order('created_at', { ascending: false })

  if (source.delivery_date) {
    query = query.eq('delivery_date', source.delivery_date)
  } else {
    query = query.is('delivery_date', null)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function mergeOrders(sourceOrderId: string, targetOrderId: string) {
  // Fetch both orders for validation
  const { data: orders, error: fetchErr } = await supabase
    .from('orders')
    .select('id, order_code, customer_id, delivery_date, delivery_time_code, order_status')
    .in('id', [sourceOrderId, targetOrderId])

  if (fetchErr) throw fetchErr
  if (!orders || orders.length !== 2) throw new Error('Could not fetch both orders')

  const source = orders.find(o => o.id === sourceOrderId)!
  const target = orders.find(o => o.id === targetOrderId)!

  // Validate same customer
  if (source.customer_id !== target.customer_id) {
    throw new Error('Orders must belong to the same customer')
  }

  // Validate same delivery date
  if (source.delivery_date !== target.delivery_date) {
    throw new Error('Orders must have the same delivery date')
  }

  // Validate both are PENDING or CONFIRMED
  const allowed = ['PENDING', 'CONFIRMED']
  if (!allowed.includes(source.order_status) || !allowed.includes(target.order_status)) {
    throw new Error('Both orders must be PENDING or CONFIRMED to merge')
  }

  // Reset packing on source items
  await supabase
    .from('order_items')
    .update({ packed_at: null, packed_by: null })
    .eq('order_id', sourceOrderId)

  // Move order_items from source to target
  const { error: moveErr } = await supabase
    .from('order_items')
    .update({ order_id: targetOrderId })
    .eq('order_id', sourceOrderId)

  if (moveErr) throw moveErr

  // Recalculate target totals
  await recalculateOrderTotal(targetOrderId)

  // Soft-cancel source order
  const { error: cancelErr } = await supabase
    .from('orders')
    .update({
      order_status: 'CANCELLED' as Order['order_status'],
      cancellation_category: 'MERGED',
      cancellation_notes: `Merged into ${target.order_code}`,
      quantity: 0,
      total_price: 0,
    })
    .eq('id', sourceOrderId)

  if (cancelErr) throw cancelErr

  return { sourceOrderCode: source.order_code, targetOrderCode: target.order_code }
}

// --- Credit Card Surcharge ---

const CC_FEE_DESCRIPTION = 'Credit Card Fee'

export async function addCreditCardSurcharge(orderId: string, surchargePercent: number) {
  // First check if surcharge line item already exists
  const { data: existing } = await supabase
    .from('order_items')
    .select('id')
    .eq('order_id', orderId)
    .eq('description', CC_FEE_DESCRIPTION)
    .is('item_id', null)

  if (existing && existing.length > 0) return // Already has surcharge

  // Calculate surcharge from current line items + shipping (excluding existing fee)
  const { data: order } = await supabase
    .from('orders')
    .select('shipping_cost')
    .eq('id', orderId)
    .single()

  const { data: items } = await supabase
    .from('order_items')
    .select('unit_price, quantity, discount, description')
    .eq('order_id', orderId)

  if (!items) return

  const subtotal = items
    .filter((i) => i.description !== CC_FEE_DESCRIPTION)
    .reduce((sum, i) => sum + i.unit_price * i.quantity - i.discount, 0)
  const shippingCost = (order as Record<string, unknown>)?.shipping_cost as number ?? 0
  const total = subtotal + shippingCost

  const feeAmount = Math.round(total * surchargePercent / 100)
  if (feeAmount <= 0) return

  const { error: insertError } = await supabase
    .from('order_items')
    .insert({
      order_id: orderId,
      item_id: null,
      description: CC_FEE_DESCRIPTION,
      quantity: 1,
      unit_price: feeAmount,
      discount: 0,
    })
  if (insertError) throw insertError

  await recalculateOrderTotal(orderId)
}

export async function removeCreditCardSurcharge(orderId: string) {
  const { data: feeItems } = await supabase
    .from('order_items')
    .select('id')
    .eq('order_id', orderId)
    .eq('description', CC_FEE_DESCRIPTION)
    .is('item_id', null)

  if (!feeItems || feeItems.length === 0) return

  const feeIds = feeItems.map(f => f.id)
  const { error: deleteError } = await supabase
    .from('order_items')
    .delete()
    .in('id', feeIds)
  if (deleteError) throw deleteError

  await recalculateOrderTotal(orderId)
}
