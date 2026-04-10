import { supabase } from '@/lib/supabase'
import type { IntakeReceipt, IntakeAdjustment, Item, SourceType } from '@/lib/types'
import type { Json } from '@/lib/database.types'

interface ReceiptFilters {
  supplierId?: string
  dateFrom?: string
  dateTo?: string
}

export async function getIntakeReceipts(filters: ReceiptFilters = {}) {
  let query = supabase
    .from('intake_receipts')
    .select(`
      *,
      suppliers(supplier_name)
    `)
    .order('created_at', { ascending: false })

  if (filters.supplierId) {
    query = query.eq('supplier_id', filters.supplierId)
  }
  if (filters.dateFrom) {
    query = query.gte('date_received', filters.dateFrom)
  }
  if (filters.dateTo) {
    query = query.lte('date_received', filters.dateTo)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getIntakeReceipt(id: string) {
  const { data, error } = await supabase
    .from('intake_receipts')
    .select(`
      *,
      suppliers(supplier_name, contact_info, supplier_type),
      intake_receipt_line_items(
        *,
        product_models(brand, model_name, color, cpu, ram_gb, storage_gb)
      )
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function getReceiptItems(receiptId: string) {
  const { data, error } = await supabase
    .from('items')
    .select(`
      *,
      product_models(brand, model_name, color, cpu, ram_gb, storage_gb, screen_size, os_family, categories(description_fields))
    `)
    .eq('intake_receipt_id', receiptId)
    .order('item_code', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getReceiptAdjustments(receiptId: string) {
  const { data, error } = await supabase
    .from('intake_adjustments')
    .select('*')
    .eq('receipt_id', receiptId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as IntakeAdjustment[]
}

interface CreateBatchParams {
  supplier_id: string
  source_type: SourceType
  date_received: string
  invoice_file_url?: string
  supplier_contact_snapshot?: string
  notes?: string
  line_items: Array<{
    product_description: string
    quantity: number
    unit_price: number
    product_id?: string
    ai_confidence?: number | null
    notes?: string
    resolved_specs?: {
      brand?: string
      model_name?: string
      cpu?: string
      ram_gb?: string
      storage_gb?: string
      screen_size?: number
      serial_number?: string
    }
  }>
}

export async function createIntakeBatch(params: CreateBatchParams) {
  const { data, error } = await supabase.rpc('create_intake_batch', {
    p_supplier_id: params.supplier_id,
    p_source_type: params.source_type,
    p_date_received: params.date_received,
    p_invoice_file_url: params.invoice_file_url ?? '',
    p_supplier_contact_snapshot: params.supplier_contact_snapshot ?? '',
    p_notes: params.notes ?? '',
    p_line_items: params.line_items as unknown as Json,
  })

  if (error) throw error
  return data as {
    receipt_id: string
    receipt_code: string
    total_items: number
    total_cost: number
    p_code_range_start: string
    p_code_range_end: string
    items: Array<{ id: string; item_code: string; line_number: number }>
  }
}

// --- Accessory Intake Batch ---

interface CreateAccessoryBatchParams {
  supplier_id: string
  date_received: string
  invoice_file_url?: string
  supplier_contact_snapshot?: string
  notes?: string
  line_items: Array<{
    accessory_id?: string
    name?: string
    brand?: string
    category_id?: string
    selling_price?: number
    quantity: number
    unit_cost: number
  }>
}

export async function createAccessoryIntakeBatch(params: CreateAccessoryBatchParams) {
  const { data, error } = await supabase.rpc('create_accessory_intake_batch', {
    p_supplier_id: params.supplier_id,
    p_date_received: params.date_received,
    p_invoice_file_url: params.invoice_file_url ?? '',
    p_supplier_contact_snapshot: params.supplier_contact_snapshot ?? '',
    p_notes: params.notes ?? '',
    p_line_items: params.line_items as unknown as Json,
  })

  if (error) throw error
  return data as {
    receipt_id: string
    receipt_code: string
    total_items: number
    total_cost: number
    entries: Array<{ accessory_id: string; quantity: number; unit_cost: number }>
  }
}

export async function generateAdjustmentCode(): Promise<string> {
  const { data, error } = await supabase.rpc('generate_code', {
    prefix: 'ADJ',
    seq_name: 'adj_code_seq',
  })

  if (error) throw error
  return data as string
}

export async function createIntakeAdjustment(params: {
  receipt_id: string
  adjustment_type: 'VOIDED' | 'RETURNED' | 'REFUNDED' | 'MISSING'
  item_ids: string[]
  reason: string
}) {
  const code = await generateAdjustmentCode()

  const { data, error } = await supabase
    .from('intake_adjustments')
    .insert({
      adjustment_code: code,
      receipt_id: params.receipt_id,
      adjustment_type: params.adjustment_type,
      item_ids: params.item_ids,
      quantity: params.item_ids.length,
      reason: params.reason,
    })
    .select()
    .single()

  if (error) throw error
  return data as IntakeAdjustment
}

export async function uploadInvoiceFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const fileName = `${crypto.randomUUID()}.${ext}`
  const filePath = `invoices/${fileName}`

  const { error } = await supabase.storage
    .from('intake-invoices')
    .upload(filePath, file, { contentType: file.type, upsert: false })

  if (error) throw error

  return filePath
}

export async function getInvoiceSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('intake-invoices')
    .createSignedUrl(path, 3600) // 1 hour expiry

  if (error || !data?.signedUrl) throw error ?? new Error('Failed to create signed URL')
  return data.signedUrl
}

export async function parseInvoice(fileUrl: string, fileType: string, supplierType?: string) {
  const { data: { session } } = await supabase.auth.getSession()

  const { data, error } = await supabase.functions.invoke('parse-invoice', {
    body: { file_url: fileUrl, file_type: fileType, supplier_type: supplierType },
    headers: { Authorization: `Bearer ${session?.access_token}` },
  })

  if (error) throw error
  return data as {
    success: boolean
    line_items: Array<{
      line_number: number
      product_description: string
      quantity: number
      unit_price: number
      confidence: number
      notes?: string
      specs?: {
        brand?: string
        model_name?: string
        cpu?: string
        ram_gb?: string
        storage_gb?: string
        screen_size?: number
        serial_number?: string
      }
    }>
    invoice_date?: string
    invoice_total?: number
    supplier_name?: string
  }
}
