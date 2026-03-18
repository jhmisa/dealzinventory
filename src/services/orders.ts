import { supabase } from '@/lib/supabase'
import type { Order, OrderInsert, OrderUpdate } from '@/lib/types'

interface OrderFilters {
  search?: string
  status?: string
  source?: string
  customerId?: string
}

export async function getOrders(filters: OrderFilters = {}) {
  let query = supabase
    .from('orders')
    .select(`
      *,
      customers(customer_code, last_name, first_name),
      sell_groups(sell_group_code, condition_grade, base_price,
        product_models(brand, model_name, cpu, ram_gb, storage_gb)
      ),
      order_items(count)
    `)
    .order('created_at', { ascending: false })

  if (filters.search) {
    query = query.ilike('order_code', `%${filters.search}%`)
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
        id, packed_at, packed_by,
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
  return { items: data ?? [], total: count ?? 0 }
}

// --- Manual Order Creation ---

interface ManualOrderInput {
  customer_id: string
  order_source: string
  shipping_address: string
  delivery_date?: string | null
  delivery_time_code?: string | null
  notes?: string | null
  items: { item_id: string; unit_price: number }[]
}

export async function createManualOrder(input: ManualOrderInput) {
  const orderCode = await generateOrderCode()

  const quantity = input.items.length
  const totalPrice = input.items.reduce((sum, item) => sum + item.unit_price, 0)

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
      sell_group_id: null,
    })
    .select()
    .single()

  if (orderError) throw orderError

  const orderItems = input.items.map((item) => ({
    order_id: (order as Order).id,
    item_id: item.item_id,
    unit_price: item.unit_price,
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

  return order as Order
}

// Get orders ready for packing (CONFIRMED status)
export async function getPackableOrders() {
  const { data, error } = await supabase
    .from('orders')
    .select(`
      *,
      customers(customer_code, last_name, first_name),
      sell_groups(sell_group_code, condition_grade,
        product_models(brand, model_name)
      ),
      order_items(
        id, packed_at,
        items(id, item_code)
      )
    `)
    .eq('order_status', 'CONFIRMED')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}
