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

export async function getSystemFeedback(filters: SystemFeedbackFilters = {}): Promise<SystemFeedback[]> {
  let query = supabase
    .from('system_feedback')
    .select('*, staff_profiles!created_by(display_name), system_feedback_media(*)')
    .order('created_at', { ascending: false })

  if (filters.status) {
    query = query.eq('status', filters.status)
  }
  if (filters.type) {
    query = query.eq('type', filters.type)
  }

  const { data, error } = await query
  if (error) throw error
  return data as SystemFeedback[]
}

export async function getSystemFeedbackById(id: string): Promise<SystemFeedback> {
  const { data, error } = await supabase
    .from('system_feedback')
    .select('*, staff_profiles!created_by(display_name), system_feedback_media(*)')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as SystemFeedback
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
    .select('*, staff_profiles!created_by(display_name), system_feedback_media(*)')
    .single()

  if (error) throw error
  return data as SystemFeedback
}

export async function updateSystemFeedback(
  id: string,
  updates: { title?: string; description?: string; status?: SystemFeedbackStatus; type?: SystemFeedbackType }
): Promise<SystemFeedback> {
  const { data, error } = await supabase
    .from('system_feedback')
    .update(updates)
    .eq('id', id)
    .select('*, staff_profiles!created_by(display_name), system_feedback_media(*)')
    .single()

  if (error) throw error
  return data as SystemFeedback
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
