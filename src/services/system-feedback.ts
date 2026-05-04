import { supabase } from '@/lib/supabase'

export type SystemFeedbackType = 'BUG' | 'FEATURE_REQUEST'
export type SystemFeedbackStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE'

export interface SystemFeedback {
  id: string
  feedback_code: string
  title: string
  description: string | null
  type: SystemFeedbackType
  status: SystemFeedbackStatus
  created_by: string | null
  created_at: string
  updated_at: string
  staff_profiles?: { display_name: string } | null
  system_feedback_media?: SystemFeedbackMedia[]
}

export interface SystemFeedbackMedia {
  id: string
  feedback_id: string
  file_url: string
  created_at: string
}

export interface SystemFeedbackFilters {
  status?: SystemFeedbackStatus
  type?: SystemFeedbackType
}

export interface CreateSystemFeedbackInput {
  title: string
  description?: string
  type: SystemFeedbackType
}

const BASE_SELECT = '*, system_feedback_media(*)'

async function attachStaffNames<T extends { created_by: string | null }>(items: T[]): Promise<(T & { staff_profiles: { display_name: string } | null })[]> {
  const staffIds = [...new Set(items.map((i) => i.created_by).filter(Boolean))] as string[]
  if (staffIds.length === 0) return items.map((i) => ({ ...i, staff_profiles: null }))

  const { data: profiles } = await supabase
    .from('staff_profiles')
    .select('id, display_name')
    .in('id', staffIds)

  const staffMap: Record<string, string> = {}
  for (const p of profiles || []) staffMap[p.id] = p.display_name

  return items.map((i) => ({
    ...i,
    staff_profiles: i.created_by && staffMap[i.created_by] ? { display_name: staffMap[i.created_by] } : null,
  }))
}

export async function getSystemFeedback(filters: SystemFeedbackFilters = {}): Promise<SystemFeedback[]> {
  let query = supabase
    .from('system_feedback')
    .select(BASE_SELECT)
    .order('created_at', { ascending: false })

  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.type) {
    query = query.eq('type', filters.type)
  }

  const { data, error } = await query
  if (error) throw error
  return attachStaffNames(data)
}

export async function getSystemFeedbackById(id: string): Promise<SystemFeedback> {
  const { data, error } = await supabase
    .from('system_feedback')
    .select(BASE_SELECT)
    .eq('id', id)
    .single()

  if (error) throw error
  const [withStaff] = await attachStaffNames([data])
  return withStaff
}

export async function createSystemFeedback(input: CreateSystemFeedbackInput): Promise<SystemFeedback> {
  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('system_feedback')
    .insert({
      title: input.title,
      description: input.description || null,
      type: input.type,
      created_by: user?.id || null,
    })
    .select(BASE_SELECT)
    .single()

  if (error) throw error
  const [withStaff] = await attachStaffNames([data])
  return withStaff
}

export async function updateSystemFeedback(
  id: string,
  updates: { title?: string; description?: string; status?: SystemFeedbackStatus; type?: SystemFeedbackType }
): Promise<SystemFeedback> {
  const { data, error } = await supabase
    .from('system_feedback')
    .update(updates)
    .eq('id', id)
    .select(BASE_SELECT)
    .single()

  if (error) throw error
  const [withStaff] = await attachStaffNames([data])
  return withStaff
}

export async function deleteSystemFeedback(id: string): Promise<void> {
  const { error } = await supabase
    .from('system_feedback')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function uploadFeedbackMedia(feedbackId: string, file: File): Promise<SystemFeedbackMedia> {
  const ext = file.name.split('.').pop()
  const path = `${feedbackId}/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('system-feedback-media')
    .upload(path, file)

  if (uploadError) throw uploadError

  const { data: { publicUrl } } = supabase.storage
    .from('system-feedback-media')
    .getPublicUrl(path)

  const { data, error } = await supabase
    .from('system_feedback_media')
    .insert({ feedback_id: feedbackId, file_url: publicUrl })
    .select()
    .single()

  if (error) throw error
  return data as SystemFeedbackMedia
}
