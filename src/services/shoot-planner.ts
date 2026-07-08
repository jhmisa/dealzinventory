import { supabase } from '@/lib/supabase'

export interface ShootPlannerMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ShootPlannerResponse {
  reply: string
  createdShootId: string | null
  codes: string[]
  toolCalls: { name: string; ok: boolean }[]
}

// Conversational shoot planner. Sends the running chat thread to the shoot-planner edge fn,
// which searches live inventory and (on confirmation) creates a shoot on the PLANNED lane.
export async function shootPlannerChat(
  messages: ShootPlannerMessage[],
): Promise<ShootPlannerResponse> {
  const { data, error } = await supabase.functions.invoke('shoot-planner', { body: { messages } })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data as ShootPlannerResponse
}
