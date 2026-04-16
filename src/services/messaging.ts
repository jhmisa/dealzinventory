import { supabase } from '@/lib/supabase'
import type {
  Conversation,
  ConversationWithRelations,
  Message,
  MessageAttachment,
  MessagingTemplate,
  MessagingTemplateInsert,
  AiProvider,
  AiProviderInsert,
  MessagingPersona,
  MessagingPersonaUpdate,
  SystemAlert,
  KnowledgeBaseEntry,
  KnowledgeBaseEntryInsert,
  KnowledgeBaseEntryUpdate,
  TestAIMessage,
  TestAIResponse,
} from '@/lib/types'

// ---------- Conversations ----------

export interface ConversationFilters {
  needs_review?: boolean
  assigned_staff_id?: string
  search?: string
  folder_id?: string
  is_archived?: boolean
}

export async function getConversations(filters: ConversationFilters = {}) {
  let query = supabase
    .from('conversations')
    .select(`
      *,
      customers:customer_id(id, customer_code, last_name, first_name),
      messages(id, role, content, status, ai_confidence, created_at)
    `)
    .order('last_message_at', { ascending: false })

  if (filters.needs_review !== undefined) {
    query = query.eq('needs_human_review', filters.needs_review)
  }
  if (filters.assigned_staff_id) {
    query = query.eq('assigned_staff_id', filters.assigned_staff_id)
  }
  // Filter by archive status (default: show non-archived)
  query = query.eq('is_archived', filters.is_archived ?? false)

  if (filters.folder_id) {
    query = query.eq('folder_id', filters.folder_id)
  }
  if (filters.search) {
    // Search both the conversation's contact_name and linked customer fields.
    // PostgREST does not support .or() on joined tables, so we pre-fetch
    // matching customer IDs and combine with a contact_name filter.
    const { data: matchingCustomers } = await supabase
      .from('customers')
      .select('id')
      .or(`last_name.ilike.%${filters.search}%,first_name.ilike.%${filters.search}%,customer_code.ilike.%${filters.search}%`)
    const customerIds = (matchingCustomers ?? []).map(c => c.id)

    // Build an OR filter: contact_name match OR customer_id in matched IDs
    const orParts: string[] = [`contact_name.ilike.%${filters.search}%`]
    if (customerIds.length > 0) {
      orParts.push(`customer_id.in.(${customerIds.join(',')})`)
    }
    query = query.or(orParts.join(','))
  }

  // Only fetch the latest message per conversation for the list view
  query = query
    .order('created_at', { referencedTable: 'messages', ascending: false })
    .limit(1, { referencedTable: 'messages' })

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ConversationWithRelations[]
}

export async function getConversation(id: string) {
  const { data, error } = await supabase
    .from('conversations')
    .select(`
      *,
      customers:customer_id(id, customer_code, last_name, first_name)
    `)
    .eq('id', id)
    .single()
  if (error) throw error
  return data as Conversation & {
    customers: { id: string; customer_code: string; last_name: string; first_name: string | null } | null
  }
}

export async function updateConversation(id: string, updates: Partial<Conversation>) {
  const { data, error } = await supabase
    .from('conversations')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Conversation
}

export async function linkCustomerToConversation(conversationId: string, customerId: string) {
  const { data, error } = await supabase
    .from('conversations')
    .update({
      customer_id: customerId,
      unmatched_contact: false,
    })
    .eq('id', conversationId)
    .select()
    .single()
  if (error) throw error
  return data as Conversation
}

export async function unlinkCustomerFromConversation(conversationId: string) {
  const { data, error } = await supabase
    .from('conversations')
    .update({
      customer_id: null,
      unmatched_contact: true,
    })
    .eq('id', conversationId)
    .select()
    .single()
  if (error) throw error
  return data as Conversation
}

export async function getNeedsReviewCount(): Promise<number> {
  const { count, error } = await supabase
    .from('conversations')
    .select('id', { count: 'exact', head: true })
    .eq('needs_human_review', true)
  if (error) throw error
  return count ?? 0
}

// ---------- Messages ----------

export async function getMessages(conversationId: string) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Message[]
}

export async function sendMessage(
  conversationId: string,
  content: string,
  approveDraftId?: string,
  attachments?: MessageAttachment[],
) {
  const { data, error } = await supabase.functions.invoke('send-message', {
    body: {
      conversation_id: conversationId,
      content,
      approve_draft_id: approveDraftId,
      attachments,
    },
  })

  if (error) {
    // Try to extract the actual error from the response body
    const detail = data?.error ?? error.message ?? 'Failed to send message'
    console.error('send-message invoke error:', { error: error.message, data, detail })
    throw new Error(`Failed to send: ${detail}`)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export async function rejectDraft(messageId: string) {
  const { data, error } = await supabase
    .from('messages')
    .update({ status: 'REJECTED' })
    .eq('id', messageId)
    .select()
    .single()
  if (error) throw error
  return data as Message
}

// ---------- Attachments ----------

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024 // 10MB

export async function uploadAttachment(
  file: File,
  pathPrefix: string,
): Promise<MessageAttachment> {
  if (file.size > MAX_ATTACHMENT_SIZE) {
    throw new Error(`File "${file.name}" exceeds the 10MB limit`)
  }

  const ext = file.name.split('.').pop() ?? 'bin'
  const fileName = `${crypto.randomUUID()}_${file.name}`
  const filePath = `${pathPrefix}/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('messaging-attachments')
    .upload(filePath, file, { contentType: file.type, upsert: false })

  if (uploadError) throw uploadError

  return {
    file_url: filePath,
    filename: file.name,
    mime_type: file.type,
    size_bytes: file.size,
  }
}

export async function deleteAttachment(filePath: string) {
  const { error } = await supabase.storage
    .from('messaging-attachments')
    .remove([filePath])
  if (error) throw error
}

export function getAttachmentPublicUrl(filePath: string): string {
  const { data } = supabase.storage
    .from('messaging-attachments')
    .getPublicUrl(filePath)
  return data.publicUrl
}

export async function getAttachmentSignedUrl(filePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('messaging-attachments')
    .createSignedUrl(filePath, 3600) // 1 hour
  if (error) throw error
  return data.signedUrl
}

export async function retryFailedMessage(messageId: string) {
  // Fetch the failed message
  const { data: msg, error: fetchError } = await supabase
    .from('messages')
    .select('conversation_id, content')
    .eq('id', messageId)
    .eq('status', 'FAILED')
    .single()

  if (fetchError || !msg) throw new Error('Failed message not found')

  // Delete the failed message and resend
  await supabase.from('messages').delete().eq('id', messageId)

  return sendMessage(msg.conversation_id, msg.content)
}

// ---------- Templates ----------

export async function getTemplates() {
  const { data, error } = await supabase
    .from('messaging_templates')
    .select('*')
    .order('name')
  if (error) throw error
  return (data ?? []) as MessagingTemplate[]
}

export async function createTemplate(template: MessagingTemplateInsert) {
  const { data, error } = await supabase
    .from('messaging_templates')
    .insert(template)
    .select()
    .single()
  if (error) throw error
  return data as MessagingTemplate
}

export async function updateTemplate(id: string, updates: Partial<MessagingTemplateInsert>) {
  const { data, error } = await supabase
    .from('messaging_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as MessagingTemplate
}

export async function deleteTemplate(id: string) {
  const { error } = await supabase
    .from('messaging_templates')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ---------- AI Providers ----------

export async function getAiProviders() {
  const { data, error } = await supabase
    .from('ai_providers')
    .select('*')
    .order('created_at')
  if (error) throw error
  return (data ?? []) as AiProvider[]
}

export async function createAiProvider(provider: AiProviderInsert) {
  const { data, error } = await supabase
    .from('ai_providers')
    .insert(provider)
    .select()
    .single()
  if (error) throw error
  return data as AiProvider
}

export async function updateAiProvider(id: string, updates: Partial<AiProviderInsert>) {
  const { data, error } = await supabase
    .from('ai_providers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as AiProvider
}

export async function setActiveAiProvider(id: string, purpose = 'messaging') {
  // Deactivate all providers for this purpose, then activate the selected one.
  // Both calls are needed; if the second fails, the unique index prevents duplicates.
  const { error: deactivateError } = await supabase
    .from('ai_providers')
    .update({ is_active: false })
    .eq('purpose', purpose)
    .neq('id', id)

  if (deactivateError) throw deactivateError

  const { data, error } = await supabase
    .from('ai_providers')
    .update({ is_active: true })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as AiProvider
}

export async function deleteAiProvider(id: string) {
  const { error } = await supabase
    .from('ai_providers')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ---------- Persona ----------

export async function getActivePersona() {
  const { data, error } = await supabase
    .from('messaging_persona')
    .select('*')
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  return data as MessagingPersona | null
}

export async function updatePersona(id: string, updates: MessagingPersonaUpdate) {
  const { data, error } = await supabase
    .from('messaging_persona')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as MessagingPersona
}

// ---------- System Alerts ----------

export async function getActiveAlerts() {
  const { data, error } = await supabase
    .from('system_alerts')
    .select('*')
    .eq('resolved', false)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as SystemAlert[]
}

export async function resolveAlert(id: string) {
  const { error } = await supabase
    .from('system_alerts')
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ---------- Analytics ----------

export interface MessagingStats {
  totalConversations: number
  needsReviewCount: number
  aiDraftsToday: number
  sentToday: number
  avgConfidence: number | null
  escalationRate: number | null
}

export async function getMessagingStats(): Promise<MessagingStats> {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()

  const [convCount, reviewCount, draftsToday, sentToday, confidenceData] = await Promise.all([
    supabase.from('conversations').select('id', { count: 'exact', head: true }),
    supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('needs_human_review', true),
    supabase.from('messages').select('id', { count: 'exact', head: true })
      .eq('role', 'assistant').gte('created_at', todayIso),
    supabase.from('messages').select('id', { count: 'exact', head: true })
      .eq('status', 'SENT').in('role', ['staff', 'assistant', 'system']).gte('created_at', todayIso),
    supabase.from('messages').select('ai_confidence')
      .eq('role', 'assistant').not('ai_confidence', 'is', null).gte('created_at', todayIso),
  ])

  const confidences = (confidenceData.data ?? [])
    .map(m => m.ai_confidence as number)
    .filter(c => c !== null)
  const avgConfidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : null
  const escalated = confidences.filter(c => c < 0.5).length
  const escalationRate = confidences.length > 0 ? escalated / confidences.length : null

  return {
    totalConversations: convCount.count ?? 0,
    needsReviewCount: reviewCount.count ?? 0,
    aiDraftsToday: draftsToday.count ?? 0,
    sentToday: sentToday.count ?? 0,
    avgConfidence,
    escalationRate,
  }
}

// ---------- System Settings ----------

export async function getSystemSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (error) throw error
  return data?.value ?? null
}

export async function updateSystemSetting(key: string, value: string) {
  const { data, error } = await supabase
    .from('system_settings')
    .update({ value })
    .eq('key', key)
    .select()
    .single()
  if (error) throw error
  return data
}

// ---------- Knowledge Base ----------

export async function getKnowledgeBaseEntries() {
  const { data, error } = await supabase
    .from('knowledge_base')
    .select('*')
    .order('sort_order')
  if (error) throw error
  return (data ?? []) as KnowledgeBaseEntry[]
}

export async function createKnowledgeBaseEntry(entry: KnowledgeBaseEntryInsert) {
  const { data, error } = await supabase
    .from('knowledge_base')
    .insert(entry)
    .select()
    .single()
  if (error) throw error
  return data as KnowledgeBaseEntry
}

export async function updateKnowledgeBaseEntry(id: string, updates: KnowledgeBaseEntryUpdate) {
  const { data, error } = await supabase
    .from('knowledge_base')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as KnowledgeBaseEntry
}

export async function deleteKnowledgeBaseEntry(id: string) {
  const { error } = await supabase
    .from('knowledge_base')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// ---------- Test AI ----------

export async function testAIReply(messages: TestAIMessage[], customerId?: string) {
  const { data, error } = await supabase.functions.invoke('test-ai-reply', {
    body: { messages, customer_id: customerId },
  })

  if (error) {
    if (data?.error) throw new Error(data.error)
    throw new Error(error.message ?? 'Failed to get AI reply')
  }
  if (data?.error) throw new Error(data.error)
  return data as TestAIResponse
}

// ---------- Missive Health Check ----------

export async function checkMissiveHealth(): Promise<{ connected: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('send-message', {
      body: { health_check: true },
    })
    if (error || data?.error) {
      return { connected: false, error: data?.error ?? error?.message }
    }
    return { connected: true }
  } catch {
    return { connected: false, error: 'Unable to reach messaging service' }
  }
}
