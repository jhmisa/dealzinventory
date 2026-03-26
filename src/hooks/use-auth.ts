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
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [staffProfile, setStaffProfile] = useState<StaffProfile | null>(null)
  const [staffProfileLoading, setStaffProfileLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Fetch or auto-create staff profile when user is available
  useEffect(() => {
    if (!user) {
      setStaffProfile(null)
      setStaffProfileLoading(false)
      return
    }

    setStaffProfileLoading(true)

    async function loadStaffProfile(u: User) {
      try {
        // Try to fetch existing profile
        const { data, error } = await supabase
          .from('staff_profiles')
          .select('*')
          .eq('id', u.id)
          .single()

        if (data) {
          setStaffProfile(data as StaffProfile)
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
          const displayName = (u.email ?? '').split('@')[0]

          const { data: newProfile, error: insertError } = await supabase
            .from('staff_profiles')
            .insert({
              id: u.id,
              email: u.email ?? '',
              display_name: displayName,
              role,
              is_active: true,
            })
            .select()
            .single()

          if (insertError) throw insertError
          setStaffProfile(newProfile as StaffProfile)
          return
        }

        if (error) throw error
      } catch (err) {
        console.error('Failed to load staff profile:', err)
      } finally {
        setStaffProfileLoading(false)
      }
    }

    loadStaffProfile(user)
  }, [user])

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

  const value: AuthContextValue = {
    user,
    session,
    loading: loading || staffProfileLoading,
    staffProfile,
    isAdmin,
    displayName,
    signIn,
    signOut,
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
