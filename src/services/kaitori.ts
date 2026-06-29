import { supabase } from '@/lib/supabase'
import { fetchAllPages } from '@/lib/fetch-all-pages'
import { searchMatches } from '@/lib/search'
import type { KaitoriRequest, KaitoriRequestInsert, KaitoriRequestUpdate, KaitoriStatus, KaitoriPaymentMethod } from '@/lib/types'

interface KaitoriFilters {
  status?: string
  search?: string
}

export async function getKaitoriRequests(filters: KaitoriFilters = {}) {
  const buildQuery = () => {
    let query = supabase
      .from('kaitori_requests')
      .select(`
        *,
        customers(id, last_name, first_name, email, phone, customer_code),
        product_models(brand, model_name, cpu, ram_gb, storage_gb),
        kaitori_request_media(id, file_url, media_type, role, sort_order)
      `)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })

    if (filters.status) {
      query = query.eq('request_status', filters.status)
    }
    return query
  }

  type Row = NonNullable<Awaited<ReturnType<typeof buildQuery>>['data']>[number]
  const rows = await fetchAllPages<Row>((from, to) => buildQuery().range(from, to))

  // Separator-insensitive fuzzy search over code + customer + product (@/lib/search).
  if (!filters.search) return rows
  return rows.filter((r) => {
    const c = r.customers as { last_name: string | null; first_name: string | null; email: string | null; phone: string | null; customer_code: string | null } | null
    const pm = r.product_models as { brand: string | null; model_name: string | null } | null
    const hay = [r.kaitori_code, c?.customer_code, c?.last_name, c?.first_name, c?.email, c?.phone, pm?.brand, pm?.model_name]
      .filter(Boolean)
      .join(' ')
    return searchMatches(hay, filters.search!)
  })
}

export async function getKaitoriRequest(id: string) {
  const { data, error } = await supabase
    .from('kaitori_requests')
    .select(`
      *,
      customers(id, last_name, first_name, email, phone, customer_code, bank_name, bank_branch, bank_account_number, bank_account_holder),
      product_models(id, brand, model_name, cpu, ram_gb, storage_gb, os_family),
      kaitori_request_media(id, file_url, media_type, role, sort_order)
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function getKaitoriRequestByCode(code: string) {
  const { data, error } = await supabase
    .from('kaitori_requests')
    .select(`
      *,
      customers(id, last_name, first_name, email, phone, customer_code),
      product_models(brand, model_name, cpu, ram_gb, storage_gb),
      kaitori_request_media(id, file_url, media_type, role, sort_order)
    `)
    .eq('kaitori_code', code)
    .single()

  if (error) throw error
  return data
}

export async function createKaitoriRequest(req: KaitoriRequestInsert) {
  const { data, error } = await supabase
    .from('kaitori_requests')
    .insert(req)
    .select()
    .single()

  if (error) throw error
  return data as KaitoriRequest
}

export async function updateKaitoriRequest(id: string, updates: KaitoriRequestUpdate) {
  const { data, error } = await supabase
    .from('kaitori_requests')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as KaitoriRequest
}

export async function updateKaitoriStatus(id: string, status: KaitoriStatus) {
  return updateKaitoriRequest(id, { request_status: status })
}

export async function revisePrice(id: string, finalPrice: number, reason: string) {
  return updateKaitoriRequest(id, {
    request_status: 'PRICE_REVISED',
    final_price: finalPrice,
    price_revised: true,
    revision_reason: reason,
  })
}

export async function sellerAcceptRevision(id: string, accepted: boolean) {
  return updateKaitoriRequest(id, {
    seller_accepted_revision: accepted,
    request_status: accepted ? 'APPROVED' : 'CANCELLED',
  })
}

export async function processPayment(
  id: string,
  paymentMethod: KaitoriPaymentMethod,
  paidBy: string,
) {
  return updateKaitoriRequest(id, {
    request_status: 'PAID',
    payment_method: paymentMethod,
    paid_at: new Date().toISOString(),
    paid_by: paidBy,
  })
}

export async function startInspection(id: string, inspectedBy: string) {
  return updateKaitoriRequest(id, {
    request_status: 'INSPECTING',
    inspected_by: inspectedBy,
    inspected_at: new Date().toISOString(),
  })
}

export async function approveKaitori(id: string, finalPrice: number) {
  return updateKaitoriRequest(id, {
    request_status: 'APPROVED',
    final_price: finalPrice,
  })
}

export async function generateKaitoriCode(): Promise<string> {
  const { data, error } = await supabase.rpc('generate_code', {
    prefix: 'KT',
    seq_name: 'kt_code_seq',
  })

  if (error) throw error
  return data as string
}

// --- Kaitori Price List ---

export async function getKaitoriPriceList() {
  const { data, error } = await supabase
    .from('kaitori_price_list')
    .select(`
      *,
      product_models(brand, model_name, cpu, ram_gb, storage_gb)
    `)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function createPriceEntry(entry: {
  product_model_id: string
  battery_condition: string
  screen_condition: string
  body_condition: string
  purchase_price: number
  active?: boolean
}) {
  const { data, error } = await supabase
    .from('kaitori_price_list')
    .insert(entry)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updatePriceEntry(id: string, updates: {
  purchase_price?: number
  active?: boolean
}) {
  const { data, error } = await supabase
    .from('kaitori_price_list')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deletePriceEntry(id: string) {
  const { error } = await supabase
    .from('kaitori_price_list')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function lookupQuote(
  productModelId: string,
  batteryCondition: string,
  screenCondition: string,
  bodyCondition: string,
) {
  const { data, error } = await supabase
    .from('kaitori_price_list')
    .select('purchase_price')
    .eq('product_model_id', productModelId)
    .eq('battery_condition', batteryCondition)
    .eq('screen_condition', screenCondition)
    .eq('body_condition', bodyCondition)
    .eq('active', true)
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data?.purchase_price ?? null
}

// --- Kaitori Request Media ---

export async function addKaitoriMedia(
  kaitoriRequestId: string,
  fileUrl: string,
  role: string = 'other',
) {
  const { data: existing } = await supabase
    .from('kaitori_request_media')
    .select('sort_order')
    .eq('kaitori_request_id', kaitoriRequestId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('kaitori_request_media')
    .insert({
      kaitori_request_id: kaitoriRequestId,
      file_url: fileUrl,
      role,
      sort_order: nextOrder,
    })
    .select()
    .single()

  if (error) throw error
  return data
}
