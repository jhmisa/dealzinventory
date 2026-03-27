import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { StaffProfile } from '@/lib/types'

interface AuthContextValue {
  user: User | null
  session: Session | null
  loading: boolean
  staffProfile: StaffProfile | null
  isAdmin: boolean
  displayName: string | null
  isPasswordRecovery: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  clearPasswordRecovery: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null)
  const [staffProfileLoading, setStaffProfileLoading] = useState(true)
  const [staffProfileError, setStaffProfileError] = useState(false)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false)
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
      }
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Fetch or auto-create staff profile when user is available
  // Keyed on user?.id (string) to avoid re-runs from token refresh reference changes
  const userId = user?.id ?? null

  useEffect(() => {
    if (!userId) {
      setStaffProfile(null)
      setStaffProfileLoading(false)
      setStaffProfileError(false)
      return
    }

    let cancelled = false
    setStaffProfileLoading(true)
    setStaffProfileError(false)

    async function loadStaffProfile() {
      try {
        // Try to fetch existing profile
        const { data, error } = await supabase
          .from('staff_profiles')
          .select('*')
          .eq('id', userId)
          .single()

        if (data) {
          if (!cancelled) setStaffProfile(data as StaffProfile)
          return
        }

        // Profile doesn't exist — auto-create
        if (error && error.code === 'PGRST116') {
          // Check if this is the first user (gets ADMIN role)
          const { count, error: countError } = await supabase
            .from('staff_profiles')
            .select('*', { count: 'exact', head: true })

          if (countError) throw countError

          const role = count === 0 ? 'ADMIN' : 'VA'
          const email = user?.email ?? ''
          const displayName = email.split('@')[0]

          const { data: newProfile, error: insertError } = await supabase
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

          if (insertError) throw insertError
          if (!cancelled) setStaffProfile(newProfile as StaffProfile)
          return
        }

        if (error) throw error
      } catch (err) {
        console.error('Failed to load staff profile:', err)
        if (!cancelled) setStaffProfileError(true)
      } finally {
        if (!cancelled) setStaffProfileLoading(false)
      }
    }

    loadStaffProfile()
    return () => { cancelled = true }
  }, [userId])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  const isAdmin = staffProfile?.role === 'ADMIN'
  const displayName = staffProfile?.display_name ?? null

  // Combined loading must stay true until:
  // 1. Auth state has settled (loading=false), AND
  // 2. If a user exists, their staff profile has been fetched
  //
  // Without the `!!user && !staffProfile` check, there's a render gap after
  // onAuthStateChange sets user (staffProfileLoading was already set to false
  // by the initial null-userId effect) but before the userId effect re-runs
  // to fetch the profile. During that gap, AdminGuard sees loading=false +
  // isAdmin=false and incorrectly redirects to dashboard.
  const isAuthSettling = loading || staffProfileLoading
  const isProfilePending = !!user && !staffProfile && !staffProfileLoading && !staffProfileError
  const isLoading = isAuthSettling || isProfilePending

  const value: AuthContextValue = {
    user,
    session,
    loading: isLoading,
    staffProfile,
    isAdmin,
    displayName,
    isPasswordRecovery,
    signIn,
    signOut,
    clearPasswordRecovery,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
