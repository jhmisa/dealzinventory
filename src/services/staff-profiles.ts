import { supabase } from '@/lib/supabase'
import type { StaffProfile, StaffProfileUpdate } from '@/lib/types'

export async function getStaffProfiles() {
  const { data, error } = await supabase
    .from('staff_profiles')
    .select('*')
    .order('display_name')

  if (error) throw error
  return data as StaffProfile[]
}

export async function getMyStaffProfile(userId: string) {
  const { data, error } = await supabase
    .from('staff_profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data as StaffProfile | null
}

export async function ensureStaffProfile(userId: string, email: string): Promise<StaffProfile> {
  // Check if profile already exists
  const existing = await getMyStaffProfile(userId)
  if (existing) return existing

  // Check if this is the first user (gets ADMIN role)
  const { count, error: countError } = await supabase
    .from('staff_profiles')
    .select('*', { count: 'exact', head: true })

  if (countError) throw countError

  const role = count === 0 ? 'ADMIN' : 'VA'
  const displayName = email.split('@')[0]

  const { data, error } = await supabase
    .from('staff_profiles')
    .insert({
      id: userId,
      email,
      display_name: displayName,
      role,
      is_active: true,
    })
    .select()
    .single()

  if (error) throw error
  return data as StaffProfile
}

export async function updateStaffProfile(id: string, updates: StaffProfileUpdate) {
  const { data, error } = await supabase
    .from('staff_profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as StaffProfile
}

export async function inviteStaff(email: string, displayName: string, role: string) {
  const { data, error } = await supabase.functions.invoke('invite-staff', {
    body: { email, display_name: displayName, role },
  })

  if (error) {
    // The SDK wraps non-2xx in a generic FunctionsHttpError that hides the
    // real error. Read the actual message from the response body.
    let message = error.message
    try {
      const body = await (error as unknown as { context?: Response }).context?.json()
      message = body?.error ?? body?.message ?? message
    } catch {
      // Response body not readable, use generic message
    }
    throw new Error(message)
  }
  if (data?.error) {
    throw new Error(data.error)
  }
  if (!data?.profile) {
    throw new Error('No profile returned')
  }
  return data.profile as StaffProfile
}
