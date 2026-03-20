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

  let query = supabase
    .from('orders')
    .select(`
      *,
      customers(customer_code, last_name, first_name, email, phone),
      sell_groups(sell_group_code, condition_grade, base_price,
        product_models(brand, model_name, cpu, ram_gb, storage_gb)
      ),
      order_items(count)
    `)
    .order('delivery_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (filters.search) {
    // Match orders by order_code OR by customer
    if (matchingCustomerIds && matchingCustomerIds.length > 0) {
      query = query.or(
        `order_code.ilike.%${filters.search}%,customer_id.in.(${matchingCustomerIds.join(',')})`
      )
    } else {
      query = query.ilike('order_code', `%${filters.search}%`)
    }
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
        id, item_id, description, quantity, unit_price, discount, packed_at, packed_by,
        items(id, item_code, condition_grade, item_status)
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

export async function cancelOrder(orderId: string) {
  // Get all inventory items in this order
  const { data: orderItems } = await supabase
    .from('order_items')
    .select('item_id')
    .eq('order_id', orderId)
    .not('item_id', 'is', null)

  // Update order status to CANCELLED
  const order = await updateOrder(orderId, { order_status: 'CANCELLED' as Order['order_status'] })

  // Revert all inventory items to AVAILABLE
  const itemIds = (orderItems ?? []).map((oi) => oi.item_id).filter((id): id is string => !!id)
  if (itemIds.length > 0) {
    await supabase
      .from('items')
      .update({ item_status: 'AVAILABLE' as Item['item_status'] })
      .in('id', itemIds)
  }

  // NULL out item_ids on cancelled order's items to free the unique index for re-use
  // (can't delete rows due to audit log FK trigger)
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
  items: {
    item_id: string | null
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
      sell_group_id: null,
    })
    .select()
    .single()

  if (orderError) throw orderError

  const orderItems = input.items.map((item) => ({
    order_id: (order as Order).id,
    item_id: item.item_id,
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
        id, packed_at, description, item_id,
        items(id, item_code)
      )
    `)
    .eq('order_status', 'CONFIRMED')
    .or(`delivery_date.is.null,delivery_date.lte.${cutoff}`)
    .order('delivery_date', { ascending: true, nullsFirst: true })

  if (error) throw error
  return data ?? []
}
