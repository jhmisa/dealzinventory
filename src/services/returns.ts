import { supabase } from '@/lib/supabase'
import type { ReturnReasonCategory, ReturnResolution, ReturnStatus } from '@/lib/constants'

// --- Types ---

export interface ReturnRequest {
  id: string
  return_code: string
  order_id: string
  customer_id: string
  return_status: ReturnStatus
  reason_category: ReturnReasonCategory
  customer_description: string
  staff_notes: string | null
  resolution: ReturnResolution | null
  resolution_notes: string | null
  refund_amount: number | null
  created_at: string
  approved_at: string | null
  received_at: string | null
  resolved_at: string | null
  updated_at: string
}

// --- Create (via Edge Function) ---

interface CreateReturnInput {
  order_id: string
  customer_id: string
  reason_category: string
  description: string
  items: { order_item_id: string; reason_note?: string }[]
}

export async function createReturnRequest(input: CreateReturnInput) {
  const { data, error } = await supabase.functions.invoke('create-return-request', {
    body: input,
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as { return_code: string; return_request_id: string }
}

// --- Queries ---

interface ReturnFilters {
  search?: string
  status?: string
  reason?: string
}

export async function getReturnRequests(filters: ReturnFilters = {}) {
  let query = supabase
    .from('return_requests')
    .select(`
      *,
      orders(order_code),
      customers(customer_code, last_name, first_name, email),
      return_request_items(id, order_item_id, item_id, reason_note)
    `)
    .order('created_at', { ascending: false })

  if (filters.search) {
    query = query.or(
      `return_code.ilike.%${filters.search}%`
    )
  }
  if (filters.status) {
    query = query.eq('return_status', filters.status)
  }
  if (filters.reason) {
    query = query.eq('reason_category', filters.reason)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getReturnRequest(id: string) {
  const { data, error } = await supabase
    .from('return_requests')
    .select(`
      *,
      orders(id, order_code, order_status, total_price, shipping_address,
        customers(customer_code, last_name, first_name, email, phone)
      ),
      customers(customer_code, last_name, first_name, email, phone),
      return_request_items(
        id, order_item_id, item_id, reason_note,
        order_items(id, description, unit_price, quantity,
          items(id, item_code, condition_grade,
            product_models(brand, model_name, color,
              product_media(file_url, role, sort_order)
            )
          )
        )
      ),
      return_request_media(id, file_url, media_type, sort_order, uploaded_at)
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function getCustomerReturns(customerId: string) {
  const { data, error } = await supabase
    .from('return_requests')
    .select(`
      *,
      orders(order_code),
      return_request_items(id, order_item_id, reason_note)
    `)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

// --- Status Updates (admin) ---

export async function updateReturnStatus(
  id: string,
  status: ReturnStatus,
  staffNotes?: string,
) {
  const updates: Record<string, unknown> = {
    return_status: status,
    updated_at: new Date().toISOString(),
  }

  if (staffNotes !== undefined) updates.staff_notes = staffNotes
  if (status === 'APPROVED') updates.approved_at = new Date().toISOString()
  if (status === 'RECEIVED') updates.received_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('return_requests')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  // When received, transition items back to INTAKE
  if (status === 'RECEIVED') {
    const { data: returnItems } = await supabase
      .from('return_request_items')
      .select('item_id')
      .eq('return_request_id', id)
      .not('item_id', 'is', null)

    const itemIds = (returnItems ?? []).map(ri => ri.item_id).filter((id): id is string => !!id)
    if (itemIds.length > 0) {
      await supabase
        .from('items')
        .update({ item_status: 'INTAKE' })
        .in('id', itemIds)
    }
  }

  return data as ReturnRequest
}

export async function resolveReturn(
  id: string,
  resolution: ReturnResolution,
  refundAmount?: number,
  resolutionNotes?: string,
) {
  const { data, error } = await supabase
    .from('return_requests')
    .update({
      return_status: 'RESOLVED' as ReturnStatus,
      resolution,
      refund_amount: refundAmount ?? null,
      resolution_notes: resolutionNotes ?? null,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as ReturnRequest
}

export async function rejectReturn(id: string, reason: string) {
  const { data, error } = await supabase
    .from('return_requests')
    .update({
      return_status: 'REJECTED' as ReturnStatus,
      resolution: 'REJECTED' as ReturnResolution,
      resolution_notes: reason,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  // Revert items to SOLD since return was rejected
  const { data: returnItems } = await supabase
    .from('return_request_items')
    .select('item_id')
    .eq('return_request_id', id)
    .not('item_id', 'is', null)

  const itemIds = (returnItems ?? []).map(ri => ri.item_id).filter((itemId): itemId is string => !!itemId)
  if (itemIds.length > 0) {
    await supabase
      .from('items')
      .update({ item_status: 'SOLD' })
      .in('id', itemIds)
  }

  return data as ReturnRequest
}

// --- Media ---

export async function uploadReturnMedia(
  returnRequestId: string,
  file: Blob | File,
  mediaType?: 'image' | 'video',
) {
  const isFile = file instanceof File
  const detectedType = mediaType ?? (file.type.startsWith('video/') ? 'video' : 'image')
  const ext = isFile
    ? (file as File).name.split('.').pop() ?? (detectedType === 'video' ? 'mp4' : 'webp')
    : detectedType === 'video' ? 'mp4' : 'webp'
  const path = `${returnRequestId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('return-media')
    .upload(path, file, { contentType: file.type || (detectedType === 'video' ? 'video/mp4' : 'image/webp') })

  if (uploadError) throw uploadError

  const { data: urlData } = supabase.storage
    .from('return-media')
    .getPublicUrl(path)

  const { data, error } = await supabase
    .from('return_request_media')
    .insert({
      return_request_id: returnRequestId,
      file_url: urlData.publicUrl,
      media_type: detectedType,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getReturnMedia(returnRequestId: string) {
  const { data, error } = await supabase
    .from('return_request_media')
    .select('*')
    .eq('return_request_id', returnRequestId)
    .order('sort_order')

  if (error) throw error
  return data ?? []
}
