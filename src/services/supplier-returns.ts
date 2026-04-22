import { supabase } from '@/lib/supabase'
import type { SupplierReturnStatus, SupplierReturnResolution, RefundPaymentMethod, SupplierReturn } from '@/lib/types'

// --- Types ---

interface CreateSupplierReturnInput {
  item_id: string
  supplier_id: string
  intake_receipt_id?: string | null
  receipt_file_url?: string | null
  reason: string
}

interface SupplierReturnFilters {
  search?: string
  status?: string
}

interface ResolveInput {
  resolution: SupplierReturnResolution
  refund_amount?: number
  refund_payment_method?: RefundPaymentMethod
  staff_notes?: string
}

// --- Create ---

export async function createSupplierReturn(input: CreateSupplierReturnInput) {
  // Generate SR-code
  const { data: returnCode, error: codeError } = await supabase.rpc('generate_code', {
    prefix: 'SR',
    seq_name: 'sr_code_seq',
  })
  if (codeError) throw codeError

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()

  // Insert supplier return
  const { data, error } = await supabase
    .from('supplier_returns')
    .insert({
      return_code: returnCode as string,
      item_id: input.item_id,
      supplier_id: input.supplier_id,
      intake_receipt_id: input.intake_receipt_id ?? null,
      receipt_file_url: input.receipt_file_url ?? null,
      reason: input.reason,
      requested_by: user?.id ?? null,
    })
    .select()
    .single()

  if (error) throw error

  // Set item status to SUPPLIER_RETURN
  const { error: itemError } = await supabase
    .from('items')
    .update({ item_status: 'SUPPLIER_RETURN' })
    .eq('id', input.item_id)

  if (itemError) throw itemError

  return data as SupplierReturn
}

// --- Queries ---

export async function getSupplierReturns(filters: SupplierReturnFilters = {}) {
  let query = supabase
    .from('supplier_returns')
    .select(`
      *,
      items(item_code, brand, model_name, color, condition_grade),
      suppliers(supplier_name)
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

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getSupplierReturn(id: string) {
  const { data, error } = await supabase
    .from('supplier_returns')
    .select(`
      *,
      items(
        id, item_code, brand, model_name, color, condition_grade,
        purchase_price, serial_number, supplier_description,
        product_models(brand, model_name, color, cpu, ram_gb, storage_gb)
      ),
      suppliers(id, supplier_name, contact_info, supplier_type),
      intake_receipts(id, receipt_code, invoice_file_url)
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

// --- Status Updates ---

export async function updateSupplierReturnStatus(id: string, status: SupplierReturnStatus) {
  const updates: Record<string, unknown> = {
    return_status: status,
    updated_at: new Date().toISOString(),
  }

  if (status === 'RETURNED') updates.returned_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('supplier_returns')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as SupplierReturn
}

// --- Resolve ---

export async function resolveSupplierReturn(id: string, input: ResolveInput) {
  // Get the return to find the item_id
  const { data: existing, error: fetchError } = await supabase
    .from('supplier_returns')
    .select('item_id')
    .eq('id', id)
    .single()

  if (fetchError) throw fetchError

  const updates: Record<string, unknown> = {
    return_status: 'RESOLVED' as SupplierReturnStatus,
    resolution: input.resolution,
    staff_notes: input.staff_notes ?? null,
    resolved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (input.resolution === 'REFUND') {
    updates.refund_amount = input.refund_amount ?? null
    updates.refund_payment_method = input.refund_payment_method ?? null
  }

  const { data, error } = await supabase
    .from('supplier_returns')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  // Update item status based on resolution
  if (input.resolution === 'EXCHANGE') {
    // Exchange: item goes back to INTAKE
    await supabase
      .from('items')
      .update({ item_status: 'INTAKE' })
      .eq('id', existing.item_id)
  } else if (input.resolution === 'REFUND') {
    // Refund: item goes to REMOVED
    await supabase
      .from('items')
      .update({ item_status: 'REMOVED' })
      .eq('id', existing.item_id)
  }

  return data as SupplierReturn
}

// --- Mark Refund Received ---

export async function markRefundReceived(id: string) {
  const { data, error } = await supabase
    .from('supplier_returns')
    .update({
      refund_received: true,
      refund_received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as SupplierReturn
}

// --- Receipt Upload ---

export async function uploadReturnReceipt(file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const fileName = `${crypto.randomUUID()}.${ext}`
  const filePath = `supplier-return-receipts/${fileName}`

  const { error } = await supabase.storage
    .from('intake-invoices')
    .upload(filePath, file, { contentType: file.type, upsert: false })

  if (error) throw error
  return filePath
}
