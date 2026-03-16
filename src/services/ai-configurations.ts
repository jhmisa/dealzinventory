import { supabase } from '@/lib/supabase'
import type { AiConfiguration, AiConfigurationInsert, AiConfigurationUpdate } from '@/lib/types'

export async function getAiConfigurations() {
  const { data, error } = await supabase
    .from('ai_configurations')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data as AiConfiguration[]
}

export async function getActiveAiConfiguration(purpose?: string) {
  let query = supabase
    .from('ai_configurations')
    .select('*')

  if (purpose) {
    // Look up by purpose — no need for is_active toggle
    query = query.eq('purpose', purpose)
  } else {
    // Fallback: get any active one (legacy behavior)
    query = query.eq('is_active', true)
  }

  // If multiple configs for same purpose, pick the most recently created
  const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle()

  if (error) throw error
  return data as AiConfiguration | null
}

export async function createAiConfiguration(config: AiConfigurationInsert) {
  const { data, error } = await supabase
    .from('ai_configurations')
    .insert(config)
    .select()
    .single()

  if (error) throw error
  return data as AiConfiguration
}

export async function updateAiConfiguration(id: string, updates: AiConfigurationUpdate) {
  const { data, error } = await supabase
    .from('ai_configurations')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as AiConfiguration
}

export async function deleteAiConfiguration(id: string) {
  const { error } = await supabase
    .from('ai_configurations')
    .delete()
    .eq('id', id)

  if (error) throw error
}

export async function setActiveAiConfiguration(id: string) {
  const { data, error } = await supabase
    .from('ai_configurations')
    .update({ is_active: true })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as AiConfiguration
}

export async function updateTestTimestamp(id: string) {
  const { data, error } = await supabase
    .from('ai_configurations')
    .update({ last_test_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as AiConfiguration
}

export async function testAiConfiguration(configId: string, fileUrl: string, fileType: string) {
  const { data: { session } } = await supabase.auth.getSession()

  const { data, error } = await supabase.functions.invoke('parse-invoice', {
    body: { file_url: fileUrl, file_type: fileType, mode: 'test', config_id: configId },
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
    }>
    error?: string
    invoice_date?: string
    invoice_total?: number
  }
}
