import { supabase } from '@/lib/supabase'
import type { TicketStatus, TicketPriority, TicketNoteType } from '@/lib/types'

// --- Types ---

export interface TicketType {
  id: string
  name: string
  slug: string
  label: string
  icon: string
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface Ticket {
  id: string
  ticket_code: string
  ticket_type_id: string
  ticket_status: TicketStatus
  priority: TicketPriority
  customer_id: string
  order_id: string | null
  conversation_id: string | null
  assigned_staff_id: string | null
  subject: string
  description: string
  resolution_notes: string | null
  created_by_role: 'staff' | 'customer'
  return_data: ReturnData | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  closed_at: string | null
}

export interface ReturnData {
  reason_category: string
  resolution_type: string | null
  refund_amount: number | null
  items: { order_item_id: string; item_id?: string | null; reason_note?: string }[]
  original_return_status?: string
}

export interface TicketNote {
  id: string
  ticket_id: string
  staff_id: string | null
  content: string
  note_type: TicketNoteType
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface TicketMedia {
  id: string
  ticket_id: string
  file_url: string
  media_type: string
  sort_order: number
  uploaded_at: string
}

// --- Customer ticket creation (via Edge Function) ---

interface CreateCustomerTicketInput {
  customer_id: string
  ticket_type_slug: string
  subject: string
  description: string
  order_id?: string
  reason_category?: string
  items?: { order_item_id: string; reason_note?: string }[]
}

export async function createCustomerTicket(input: CreateCustomerTicketInput) {
  const { data, error } = await supabase.functions.invoke('create-ticket', {
    body: input,
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as { ticket_code: string; ticket_id: string }
}

// --- Ticket Types ---

export async function getTicketTypes() {
  const { data, error } = await supabase
    .from('ticket_types')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  if (error) throw error
  return (data ?? []) as TicketType[]
}

// --- Queries ---

export interface TicketFilters {
  search?: string
  status?: string
  type?: string
  priority?: string
  assigned?: string
}

export async function getTickets(filters: TicketFilters = {}) {
  let query = supabase
    .from('tickets')
    .select(`
      *,
      ticket_types(id, name, slug, label, icon),
      customers(customer_code, last_name, first_name, email),
      orders(order_code)
    `)
    .order('created_at', { ascending: false })

  if (filters.search) {
    query = query.or(
      `ticket_code.ilike.%${filters.search}%,subject.ilike.%${filters.search}%`
    )
  }
  if (filters.status) {
    query = query.eq('ticket_status', filters.status)
  }
  if (filters.type) {
    query = query.eq('ticket_type_id', filters.type)
  }
  if (filters.priority) {
    query = query.eq('priority', filters.priority)
  }
  if (filters.assigned) {
    query = query.eq('assigned_staff_id', filters.assigned)
  }

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function getTicket(id: string) {
  const { data, error } = await supabase
    .from('tickets')
    .select(`
      *,
      ticket_types(id, name, slug, label, icon),
      customers(id, customer_code, last_name, first_name, email, phone),
      orders(id, order_code, order_status, total_price),
      ticket_media(id, file_url, media_type, sort_order, uploaded_at),
      ticket_notes(id, staff_id, content, note_type, metadata, created_at)
    `)
    .eq('id', id)
    .order('created_at', { referencedTable: 'ticket_notes', ascending: false })
    .single()

  if (error) throw error
  return data
}

export async function getCustomerTickets(customerId: string) {
  const { data, error } = await supabase
    .from('tickets')
    .select(`
      *,
      ticket_types(id, name, slug, label, icon),
      orders(order_code)
    `)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getOrderTickets(orderId: string) {
  const { data, error } = await supabase
    .from('tickets')
    .select(`
      *,
      ticket_types(id, name, slug, label, icon),
      customers(customer_code, last_name, first_name)
    `)
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getConversationTickets(conversationId: string) {
  const { data, error } = await supabase
    .from('tickets')
    .select(`
      *,
      ticket_types(id, name, slug, label, icon),
      customers(customer_code, last_name, first_name)
    `)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

// --- Mutations ---

export async function generateTicketCode() {
  const { data, error } = await supabase.rpc('generate_code', {
    prefix: 'TK',
    seq_name: 'tk_code_seq',
  })
  if (error) throw error
  return data as string
}

interface CreateTicketInput {
  ticket_type_id: string
  customer_id: string
  subject: string
  description: string
  priority?: TicketPriority
  order_id?: string
  conversation_id?: string
  assigned_staff_id?: string
  created_by_role?: 'staff' | 'customer'
  return_data?: ReturnData
}

export async function createTicket(input: CreateTicketInput) {
  const ticketCode = await generateTicketCode()

  const { data, error } = await supabase
    .from('tickets')
    .insert({
      ticket_code: ticketCode,
      ticket_type_id: input.ticket_type_id,
      customer_id: input.customer_id,
      subject: input.subject,
      description: input.description,
      priority: input.priority ?? 'NORMAL',
      order_id: input.order_id || null,
      conversation_id: input.conversation_id || null,
      assigned_staff_id: input.assigned_staff_id || null,
      created_by_role: input.created_by_role ?? 'staff',
      return_data: input.return_data ? (input.return_data as unknown as Record<string, unknown>) : null,
    })
    .select()
    .single()

  if (error) throw error
  return data as Ticket
}

interface UpdateTicketInput {
  subject?: string
  description?: string
  priority?: TicketPriority
  assigned_staff_id?: string | null
  order_id?: string | null
  conversation_id?: string | null
}

export async function updateTicket(id: string, updates: UpdateTicketInput) {
  const { data, error } = await supabase
    .from('tickets')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as Ticket
}

export async function updateTicketStatus(
  id: string,
  status: TicketStatus,
  notes?: string,
) {
  const updates: Record<string, unknown> = {
    ticket_status: status,
  }

  if (status === 'RESOLVED') updates.resolved_at = new Date().toISOString()
  if (status === 'CLOSED') updates.closed_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('tickets')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  // Log the status change as a note
  await addTicketNote(id, notes || `Status changed to ${status}`, 'status_change', { new_status: status })

  // For RETURN tickets: when status → IN_PROGRESS and items exist, handle item status
  const ticket = data as Ticket
  if (ticket.return_data?.items && status === 'RESOLVED') {
    // Return is resolved — items that were received go back to INTAKE
    const itemIds = ticket.return_data.items
      .map(i => i.item_id)
      .filter((id): id is string => !!id)

    if (itemIds.length > 0) {
      await supabase
        .from('items')
        .update({ item_status: 'INTAKE' })
        .in('id', itemIds)
    }
  }

  return data as Ticket
}

export async function assignTicket(id: string, staffId: string | null) {
  const { data, error } = await supabase
    .from('tickets')
    .update({ assigned_staff_id: staffId })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  await addTicketNote(id, staffId ? `Ticket assigned` : 'Ticket unassigned', 'assignment', { staff_id: staffId })

  return data as Ticket
}

export async function resolveTicket(id: string, resolutionNotes: string) {
  const { data, error } = await supabase
    .from('tickets')
    .update({
      ticket_status: 'RESOLVED' as TicketStatus,
      resolution_notes: resolutionNotes,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error

  await addTicketNote(id, `Resolved: ${resolutionNotes}`, 'status_change', { new_status: 'RESOLVED' })

  // For RETURN tickets: handle item status transitions
  const ticket = data as Ticket
  if (ticket.return_data?.items) {
    const itemIds = ticket.return_data.items
      .map(i => i.item_id)
      .filter((itemId): itemId is string => !!itemId)

    if (itemIds.length > 0) {
      await supabase
        .from('items')
        .update({ item_status: 'INTAKE' })
        .in('id', itemIds)
    }
  }

  return data as Ticket
}

// --- Notes ---

export async function addTicketNote(
  ticketId: string,
  content: string,
  noteType: TicketNoteType = 'note',
  metadata?: Record<string, unknown>,
) {
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('ticket_notes')
    .insert({
      ticket_id: ticketId,
      staff_id: user?.id ?? null,
      content,
      note_type: noteType,
      metadata: metadata ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as TicketNote
}

export async function getTicketNotes(ticketId: string) {
  const { data, error } = await supabase
    .from('ticket_notes')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as TicketNote[]
}

// --- Media ---

export async function uploadTicketMedia(
  ticketId: string,
  file: Blob | File,
  mediaType?: 'image' | 'video',
) {
  const isFile = file instanceof File
  const detectedType = mediaType ?? (file.type.startsWith('video/') ? 'video' : 'image')
  const ext = isFile
    ? (file as File).name.split('.').pop() ?? (detectedType === 'video' ? 'mp4' : 'webp')
    : detectedType === 'video' ? 'mp4' : 'webp'
  const path = `${ticketId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('ticket-media')
    .upload(path, file, { contentType: file.type || (detectedType === 'video' ? 'video/mp4' : 'image/webp') })

  if (uploadError) throw uploadError

  const { data: urlData } = supabase.storage
    .from('ticket-media')
    .getPublicUrl(path)

  const { data, error } = await supabase
    .from('ticket_media')
    .insert({
      ticket_id: ticketId,
      file_url: urlData.publicUrl,
      media_type: detectedType,
    })
    .select()
    .single()

  if (error) throw error
  return data as TicketMedia
}

export async function getTicketMedia(ticketId: string) {
  const { data, error } = await supabase
    .from('ticket_media')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('sort_order')

  if (error) throw error
  return (data ?? []) as TicketMedia[]
}
