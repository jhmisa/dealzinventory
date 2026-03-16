import { supabase } from '@/lib/supabase'

export interface AiPrompt {
  id: string
  name: string
  description: string | null
  prompt_text: string
  media_type: string
  sample_image_url: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type AiPromptInsert = Omit<AiPrompt, 'id' | 'created_at' | 'updated_at'>
export type AiPromptUpdate = Partial<AiPromptInsert>

export async function getAiPrompts(mediaType?: string) {
  let query = supabase
    .from('ai_prompts')
    .select('*')
    .order('sort_order', { ascending: true })

  if (mediaType) {
    query = query.eq('media_type', mediaType)
  }

  const { data, error } = await query

  if (error) throw error
  return data as AiPrompt[]
}

export async function getAiPrompt(id: string) {
  const { data, error } = await supabase
    .from('ai_prompts')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as AiPrompt
}

export async function getActiveAiPrompts(mediaType?: string) {
  let query = supabase
    .from('ai_prompts')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (mediaType) {
    query = query.eq('media_type', mediaType)
  }

  const { data, error } = await query

  if (error) throw error
  return data as AiPrompt[]
}

export async function createAiPrompt(prompt: AiPromptInsert) {
  const { data, error } = await supabase
    .from('ai_prompts')
    .insert(prompt)
    .select()
    .single()

  if (error) throw error
  return data as AiPrompt
}

export async function updateAiPrompt(id: string, updates: AiPromptUpdate) {
  const { data, error } = await supabase
    .from('ai_prompts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as AiPrompt
}

export async function deleteAiPrompt(id: string) {
  const { error } = await supabase
    .from('ai_prompts')
    .delete()
    .eq('id', id)

  if (error) throw error
}
