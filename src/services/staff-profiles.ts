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
  // Use refreshSession() instead of getSession() to ensure a fresh access token.
  // getSession() returns the cached token which may be expired, causing the
  // Supabase gateway to reject the request with 401 before our function runs.
  const { data: { session } } = await supabase.auth.refreshSession()
  if (!session) throw new Error('Not authenticated')

  // Use fetch directly instead of supabase.functions.invoke() so we always
  // get the actual response body. The SDK wraps non-2xx in a generic
  // FunctionsHttpError that hides the real error message.
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-staff`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email, display_name: displayName, role }),
    }
  )

  let body: { error?: string; profile?: StaffProfile }
  try {
    body = await res.json()
  } catch {
    throw new Error(`Unexpected response (HTTP ${res.status})`)
  }

  // Handle errors from our function ({"error":"..."}) or the gateway ({"message":"..."})
  const errorMessage = body.error ?? (body as Record<string, unknown>).message as string | undefined
  if (errorMessage) {
    throw new Error(errorMessage)
  }
  if (!body.profile) {
    throw new Error('No profile returned')
  }
  return body.profile
}
